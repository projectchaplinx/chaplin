import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLocPublicDomainRegistry,
  parseLocTimedMediaSource,
  planTimedMediaPassages,
  timedMediaQueryKey,
} from "@/lib/director-timed-media";

test("Library of Congress registry parser discovers every gallery item without duplicates", () => {
  const result = parseLocPublicDomainRegistry({ content: { components: [{ masonry_gallery: [{ items: [
    { title: "Film A", link: "/item/abc/" },
    { title: "Film A duplicate", link: "/item/abc/" },
    { title: "Film B", link: "/item/def/" },
  ] }] }] } });
  assert.deepEqual(result, [
    { itemId: "abc", title: "Film A duplicate", itemUrl: "https://www.loc.gov/item/abc/" },
    { itemId: "def", title: "Film B", itemUrl: "https://www.loc.gov/item/def/" },
  ]);
});

test("item parser retains exact official media provenance and duration", () => {
  const source = parseLocTimedMediaSource(
    { itemId: "abc", title: "Registry title", itemUrl: "https://www.loc.gov/item/abc/" },
    { item: { title: "Catalog title", date: "1936", location: ["Michigan"], resources: [{
      duration: 1200,
      video: "https://tile.loc.gov/storage-services/example.mp4",
      media_object_id: "media-1",
    }] } },
  );
  assert.equal(source.mediaUrl, "https://tile.loc.gov/storage-services/example.mp4");
  assert.equal(source.durationSeconds, 1200);
  assert.equal(source.dateLabel, "1936");
  assert.equal(source.region, "Michigan");
});

test("long works receive opening, middle, and closing passages while short works are complete", () => {
  assert.deepEqual(planTimedMediaPassages(45), [
    { id: "complete", startSecond: 0, durationSeconds: 45, label: "Complete work" },
  ]);
  assert.deepEqual(planTimedMediaPassages(600), [
    { id: "opening", startSecond: 0, durationSeconds: 30, label: "Opening passage" },
    { id: "middle", startSecond: 285, durationSeconds: 30, label: "Middle passage" },
    { id: "closing", startSecond: 570, durationSeconds: 30, label: "Closing passage" },
  ]);
  assert.equal(timedMediaQueryKey("abc", planTimedMediaPassages(600)[1]), "film:abc:middle:285-30");
});

test("untrusted media hosts never enter automated analysis", () => {
  assert.throws(() => parseLocTimedMediaSource(
    { itemId: "abc", title: "Film", itemUrl: "https://www.loc.gov/item/abc/" },
    { item: { resources: [{ duration: 60, video: "https://example.com/film.mp4" }] } },
  ), /untrusted media host/i);
});
