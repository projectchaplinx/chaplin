import "server-only";

import { compactEvidenceTags, type NormalizedEvidenceInput } from "@/lib/director-evidence-manifest";
import type { DirectorResearchSourceRecord } from "@/lib/director-research";
import { evidenceFallsWithinPlan, northAmericanLocation, type DirectorResearchQueryPlan } from "@/lib/director-research-query-plan";
import { providerScheduler } from "@/lib/provider-scheduler";

export class EvidenceConnectorConfigurationError extends Error {}

const MAX_ITEMS = 8;
const ALLOWED_HOSTS = new Set([
  "www.loc.gov", "collectionapi.metmuseum.org", "api.si.edu", "api.europeana.eu", "api.dp.la",
]);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return [item.title, item.name, item.label, item.displayDate].flatMap(strings);
  }
  return [];
}

function first(...values: unknown[]) {
  return values.flatMap(strings).map((value) => value.trim()).find(Boolean) ?? "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function fetchJson(url: URL, headers: Record<string, string> = {}) {
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`Evidence connector host is not allowed: ${url.hostname}`);
  const concurrency = url.hostname === "collectionapi.metmuseum.org" ? 2 : 1;
  return providerScheduler(`director-evidence:${url.hostname}`, concurrency).submit(url.toString(), async () => {
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "ChaplinDirectorResearch/2.0", ...headers }, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    if (!response.ok) throw new Error(`${url.hostname} evidence API returned ${response.status}.`);
    const length = Number(response.headers.get("content-length")) || 0;
    if (length > 5_000_000) throw new Error("Evidence response exceeded the 5 MB safety limit.");
    return await response.json() as unknown;
  });
}

function rightsReuse(label: string, publicDomain = false): NormalizedEvidenceInput["reuseStatus"] {
  const normalized = label.toLowerCase();
  if (publicDomain || /\bcc0\b|public domain|publicdomain\/(?:zero|mark)|no known copyright/.test(normalized)) return "reusable";
  if (/in copyright|all rights reserved|restricted|permission/.test(normalized)) return "restricted";
  return label ? "metadata-only" : "unknown";
}

function metObjectMatchesPlan(item: Record<string, unknown>, plan?: DirectorResearchQueryPlan) {
  if (!plan) return true;
  const begin = Number(item.objectBeginDate);
  const end = Number(item.objectEndDate);
  if (Number.isFinite(begin) && Number.isFinite(end) && (end < plan.startYear || begin > plan.endYear)) return false;
  const expected = (plan.providerQueries?.met?.region || plan.region).toLowerCase();
  const haystack = [item.country, item.region, item.city, item.culture, item.period, item.dynasty]
    .flatMap(strings).join(" ").toLowerCase();
  if (expected === "europe") return /europe|britain|england|france|german|ital|spain|netherlands|austria|sweden|norway|denmark|poland|russia/.test(haystack);
  if (expected === "africa") return /africa|ghana|mali|nigeria|ethiopia|kenya|congo|zimbabwe|south africa|burkina|côte d'ivoire/.test(haystack);
  return expected.split(/\s+/).some((token) => token.length > 2 && haystack.includes(token));
}

function locItem(data: unknown, source: DirectorResearchSourceRecord, kind: NormalizedEvidenceInput["kind"]): NormalizedEvidenceInput | null {
  const root = record(data);
  const item = { ...root, ...record(root.item) };
  const id = first(item.item_id, record(root.item).id, root.id, root.url);
  const canonicalUrl = first(root.id, root.url, item.link);
  if (!id || !canonicalUrl || !canonicalUrl.startsWith("http")) return null;
  const rights = first(item.rights, item.rights_advisory, item.rights_information, item.restriction, item.access_advisory, item.use_and_reproduction_control);
  const subjects = strings(item.subject).concat(strings(item.subjects));
  const locations = strings(item.location).concat(strings(item.locations));
  return {
    kind, provider: "loc", externalId: first(item.item_id, id), canonicalUrl: canonicalUrl.replace(/^http:/, "https:"),
    recordLocator: `LOC item ${first(item.item_id, id)}`, title: first(item.title, source.title), institution: source.institution,
    dateLabel: first(item.date, item.created_published, item.created_published_date), region: first(...locations),
    tags: compactEvidenceTags([...source.targetTags, ...subjects.slice(0, 12)]),
    facets: { subjects: subjects.slice(0, 12), locations: locations.slice(0, 8), formats: strings(item.format).slice(0, 8), medium: strings(item.medium).slice(0, 8), contributors: strings(item.contributor_names).slice(0, 8) },
    provenance: { repository: first(item.repository), sourceUrl: source.sourceUrl }, rightsUri: null,
    rightsLabel: rights, reuseStatus: rightsReuse(rights, kind === "provenance-record" && /public-domain/i.test(source.rightsBasis)),
    rightsNotes: source.rightsBasis, culturallySensitive: false,
  };
}

async function discoverLoc(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  const url = new URL("https://www.loc.gov/photos/");
  url.searchParams.set("fo", "json"); url.searchParams.set("c", String(MAX_ITEMS));
  url.searchParams.set("q", plan?.providerQueries?.loc?.query || plan?.query || "street vendors laborers clothing");
  if (plan && plan.startYear > 0) url.searchParams.set("dates", `${plan.startYear}/${plan.endYear}`);
  let root = record(await fetchJson(url));
  if (plan && (!Array.isArray(root.results) || !root.results.length)) {
    url.searchParams.delete("dates");
    root = record(await fetchJson(url));
  }
  return (Array.isArray(root.results) ? root.results : [])
    .map((value) => locItem(value, source, "collection-item"))
    .filter((value): value is NormalizedEvidenceInput => Boolean(value))
    .filter((value) => !plan || (evidenceFallsWithinPlan(value.dateLabel, plan)
      && (plan.regionId !== "north-america" || northAmericanLocation(value.region))))
    .slice(0, MAX_ITEMS);
}

async function resolveLocProvenance(source: DirectorResearchSourceRecord) {
  if (/Public Domain Films from the National Film Registry/i.test(source.title)) {
    return [{ kind: "provenance-record", provider: "loc", externalId: source.id, canonicalUrl: source.sourceUrl!, recordLocator: "Library of Congress free-to-use registry", title: source.title, institution: source.institution, dateLabel: "", region: "United States", tags: source.targetTags, facets: { collection: "National Film Registry" }, provenance: { sourceUrl: source.sourceUrl }, rightsUri: source.sourceUrl, rightsLabel: "Library of Congress public-domain free-to-use registry", reuseStatus: "reusable", rightsNotes: source.rightsBasis, culturallySensitive: false }] satisfies NormalizedEvidenceInput[];
  }
  const url = new URL(source.sourceUrl!); url.searchParams.set("fo", "json");
  const item = locItem(await fetchJson(url), source, "provenance-record");
  return item ? [item] : [];
}

async function discoverMet(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  const search = new URL("https://collectionapi.metmuseum.org/public/collection/v1/search");
  search.searchParams.set("hasImages", "true");
  if (plan) {
    if (plan.startYear > 0) { search.searchParams.set("dateBegin", String(plan.startYear)); search.searchParams.set("dateEnd", String(plan.endYear)); }
    search.searchParams.set("geoLocation", plan.providerQueries?.met?.region || plan.region);
    search.searchParams.set("q", plan.providerQueries?.met?.query || plan.query);
  } else {
    search.searchParams.set("dateBegin", "1603"); search.searchParams.set("dateEnd", "1868"); search.searchParams.set("geoLocation", "Japan"); search.searchParams.set("q", "kimono");
  }
  const root = record(await fetchJson(search));
  const ids = (Array.isArray(root.objectIDs) ? root.objectIDs : []).slice(0, MAX_ITEMS);
  const objects = await Promise.all(ids.map((id) => fetchJson(new URL(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`))));
  return objects.map((value): NormalizedEvidenceInput | null => {
    const item = record(value); const id = first(item.objectID); const canonicalUrl = first(item.objectURL);
    if (!id || !canonicalUrl || !metObjectMatchesPlan(item, plan)) return null;
    const isPublicDomain = item.isPublicDomain === true;
    return {
      kind: "collection-item", provider: "met", externalId: id, canonicalUrl, recordLocator: `Met object ${id}`,
      title: first(item.title, "Untitled object"), institution: first(item.repository, source.institution),
      dateLabel: first(item.objectDate), periodStart: Number(item.objectBeginDate) || null, periodEnd: Number(item.objectEndDate) || null,
      region: first(item.country, item.region, item.city),
      tags: compactEvidenceTags([...source.targetTags, item.classification, item.objectName, item.culture]),
      facets: { culture: first(item.culture), period: first(item.period), dynasty: first(item.dynasty), objectType: first(item.objectName), medium: first(item.medium), dimensions: first(item.dimensions), geography: [first(item.country), first(item.region), first(item.city)].filter(Boolean) },
      provenance: { repository: first(item.repository), accessionNumber: first(item.accessionNumber), sourceUrl: source.sourceUrl },
      rightsUri: isPublicDomain ? "https://creativecommons.org/publicdomain/zero/1.0/" : null,
      rightsLabel: isPublicDomain ? "Public domain / Open Access" : "Rights not cleared for reusable visual evidence",
      reuseStatus: isPublicDomain ? "reusable" : "metadata-only", rightsNotes: source.rightsBasis,
      culturallySensitive: /funerary|sacred|ceremonial|reliquary|human remains|mask|power figure|nkisi/i.test(`${first(item.title)} ${first(item.objectName)} ${first(item.classification)}`),
    };
  }).filter((value): value is NormalizedEvidenceInput => Boolean(value));
}

function requireKey(name: "SMITHSONIAN_API_KEY" | "EUROPEANA_API_KEY" | "DPLA_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new EvidenceConnectorConfigurationError(`${name} is required for this official collection API.`);
  return value;
}

async function discoverSmithsonian(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  const url = new URL("https://api.si.edu/openaccess/api/v1.0/search");
  const configuredKey = process.env.SMITHSONIAN_API_KEY?.trim();
  url.searchParams.set("api_key", configuredKey || "DEMO_KEY"); url.searchParams.set("q", plan?.providerQueries?.smithsonian?.query || plan?.query || "daily life clothing tools"); url.searchParams.set("rows", String(MAX_ITEMS)); url.searchParams.set("row_group", "objects");
  let payload: unknown;
  try { payload = await fetchJson(url); }
  catch (error) {
    if (!configuredKey) throw new EvidenceConnectorConfigurationError("SMITHSONIAN_API_KEY is needed because the public demo quota is currently exhausted.");
    throw error;
  }
  const root = record(payload); const response = record(root.response);
  return (Array.isArray(response.rows) ? response.rows : []).map((value): NormalizedEvidenceInput | null => {
    const item = record(value); const id = first(item.id); const content = record(item.content); const descriptive = record(content.descriptiveNonRepeating); const indexed = record(content.indexedStructured);
    const canonicalUrl = first(descriptive.record_link, descriptive.guid, item.url, `https://api.si.edu/openaccess/api/v1.0/content/${encodeURIComponent(id)}`);
    if (!id || !canonicalUrl) return null;
    const media = Array.isArray(record(descriptive.online_media).media) ? record(descriptive.online_media).media as unknown[] : [];
    const usage = [first(record(descriptive.metadata_usage).access), ...media.map((entry) => first(record(record(entry).usage).access))].filter(Boolean).join("; ");
    return { kind: "collection-item", provider: "smithsonian", externalId: id, canonicalUrl, recordLocator: `Smithsonian record ${id}`, title: first(item.title), institution: first(descriptive.data_source, source.institution), dateLabel: first(...strings(indexed.date)), region: first(...strings(indexed.place)), tags: compactEvidenceTags([...source.targetTags, ...strings(indexed.topic), ...strings(indexed.object_type)]), facets: { date: strings(indexed.date), place: strings(indexed.place), culture: strings(indexed.culture), objectType: strings(indexed.object_type), usage, credential: configuredKey ? "configured" : "public-demo" }, provenance: { sourceUrl: source.sourceUrl }, rightsUri: /cc0/i.test(usage) ? "https://creativecommons.org/publicdomain/zero/1.0/" : null, rightsLabel: usage, reuseStatus: rightsReuse(usage), rightsNotes: source.rightsBasis, culturallySensitive: /culturally sensitive|repatriation|sacred|funerary|ceremonial/i.test(JSON.stringify(content)) };
  }).filter((value): value is NormalizedEvidenceInput => Boolean(value));
}

async function discoverEuropeana(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  const url = new URL("https://api.europeana.eu/record/v2/search.json");
  const configuredKey = process.env.EUROPEANA_API_KEY?.trim();
  url.searchParams.set("query", plan?.providerQueries?.europeana?.query || plan?.query || "daily life clothing work"); url.searchParams.set("rows", String(MAX_ITEMS)); url.searchParams.set("profile", "rich"); url.searchParams.set("media", "true"); url.searchParams.set("reusability", "open");
  if (plan?.startYear && plan.startYear > 0) url.searchParams.append("qf", `YEAR:[${plan.startYear} TO ${plan.endYear}]`);
  let root = record(await fetchJson(url, { "X-Api-Key": configuredKey || "api2demo" }));
  if (plan && (!Array.isArray(root.items) || !root.items.length)) {
    url.searchParams.delete("qf");
    root = record(await fetchJson(url, { "X-Api-Key": configuredKey || "api2demo" }));
  }
  return (Array.isArray(root.items) ? root.items : []).map((value): NormalizedEvidenceInput | null => {
    const item = record(value); const id = first(item.id); const canonicalUrl = first(item.guid, ...strings(item.edmIsShownAt)).replace(/^http:/, "https:"); const rights = first(...strings(item.rights));
    if (!id || !canonicalUrl) return null;
    return { kind: "collection-item", provider: "europeana", externalId: id, canonicalUrl, recordLocator: `Europeana record ${id}`, title: first(...strings(item.title)), institution: first(...strings(item.dataProvider), source.institution), dateLabel: first(...strings(item.year)), region: first(...strings(item.country)), tags: compactEvidenceTags([...source.targetTags, ...strings(item.type)]), facets: { provider: strings(item.provider), dataProvider: strings(item.dataProvider), type: strings(item.type), language: strings(item.language), credential: configuredKey ? "configured" : "public-demo" }, provenance: { sourceUrl: source.sourceUrl }, rightsUri: rights.startsWith("http") ? rights.replace(/^http:/, "https:") : null, rightsLabel: rights, reuseStatus: rightsReuse(rights), rightsNotes: source.rightsBasis, culturallySensitive: false };
  }).filter((value): value is NormalizedEvidenceInput => Boolean(value));
}

async function discoverDpla(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  const url = new URL("https://api.dp.la/v2/items"); url.searchParams.set("api_key", requireKey("DPLA_API_KEY")); url.searchParams.set("q", plan?.providerQueries?.dpla?.query || plan?.query || "daily life clothing work"); url.searchParams.set("page_size", String(MAX_ITEMS));
  if (plan && plan.startYear > 0) { url.searchParams.set("sourceResource.date.after", String(plan.startYear)); url.searchParams.set("sourceResource.date.before", String(plan.endYear)); }
  const root = record(await fetchJson(url));
  return (Array.isArray(root.docs) ? root.docs : []).map((value): NormalizedEvidenceInput | null => {
    const item = record(value); const sourceResource = record(item.sourceResource); const id = first(item.id); const canonicalUrl = first(item.isShownAt, item["@id"]); const rights = first(item.rights, sourceResource.rights);
    if (!id || !canonicalUrl) return null;
    return { kind: "collection-item", provider: "dpla", externalId: id, canonicalUrl, recordLocator: `DPLA record ${id}`, title: first(sourceResource.title), institution: first(record(item.provider).name, source.institution), dateLabel: first(...strings(sourceResource.date)), region: first(...strings(sourceResource.spatial)), tags: compactEvidenceTags([...source.targetTags, ...strings(sourceResource.type), ...strings(sourceResource.subject)]), facets: { provider: record(item.provider).name, type: strings(sourceResource.type), spatial: strings(sourceResource.spatial), subject: strings(sourceResource.subject).slice(0, 12) }, provenance: { sourceUrl: source.sourceUrl }, rightsUri: rights.startsWith("http") ? rights : null, rightsLabel: rights, reuseStatus: rightsReuse(rights), rightsNotes: source.rightsBasis, culturallySensitive: false };
  }).filter((value): value is NormalizedEvidenceInput => Boolean(value));
}

export async function discoverDirectorEvidence(source: DirectorResearchSourceRecord, plan?: DirectorResearchQueryPlan) {
  if (/Library of Congress structured era-evidence/i.test(source.title)) return discoverLoc(source, plan);
  if (/Met Collection API material-world/i.test(source.title)) return discoverMet(source, plan);
  if (/Smithsonian Open Access collections/i.test(source.title)) return discoverSmithsonian(source, plan);
  if (/Europeana Search, Record/i.test(source.title)) return discoverEuropeana(source, plan);
  if (/Digital Public Library of America/i.test(source.title)) return discoverDpla(source, plan);
  if (source.sourceKind === "public-domain" && source.institution === "Library of Congress") return resolveLocProvenance(source);
  throw new EvidenceConnectorConfigurationError(`No evidence connector is configured for ${source.title}.`);
}
