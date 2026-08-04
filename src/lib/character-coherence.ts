import type { Archetype, VoiceGender } from "@/lib/types";

const GIVEN_NAMES: Record<VoiceGender, Record<Archetype, string[]>> = {
  feminine: {
    villain: ["Naina", "Zoya"],
    mentor: ["Leela", "Mira"],
    "love-interest": ["Aanya", "Meher"],
    "comic-relief": ["Tara", "Pia"],
    hero: ["Anaya", "Ira"],
    superhero: ["Astra", "Sana"],
    horror: ["Rhea", "Noor"],
    rebel: ["Aditi", "Kavya"],
    sidekick: ["Juno", "Maya"],
    outsider: ["Selene", "Asha"],
  },
  masculine: {
    villain: ["Aarav", "Rohan"],
    mentor: ["Ishaan", "Kabir"],
    "love-interest": ["Rayan", "Zayn"],
    "comic-relief": ["Nikhil", "Arjun"],
    hero: ["Veer", "Dev"],
    superhero: ["Naveen", "Arin"],
    horror: ["Samar", "Ilyas"],
    rebel: ["Rafi", "Yuvan"],
    sidekick: ["Aman", "Neel"],
    outsider: ["Rumi", "Ishan"],
  },
  androgynous: {
    villain: ["Vesper", "Noor"],
    mentor: ["Kiran", "Mitra"],
    "love-interest": ["Rumi", "Ari"],
    "comic-relief": ["Juno", "Pip"],
    hero: ["Kiran", "Arya"],
    superhero: ["Astra", "Nova"],
    horror: ["Noor", "Ash"],
    rebel: ["Rumi", "Kiran"],
    sidekick: ["Pip", "Juno"],
    outsider: ["Vesper", "Rumi"],
  },
};

const SURNAMES = ["Qureshi", "Malhotra", "Dutta", "Kapoor", "Rao", "Bose", "Mirza", "Iyer"];

function seededIndex(value: string, length: number) {
  const seed = value.split("").reduce((total, character) => total + character.charCodeAt(0), 0);
  return seed % length;
}

export function explicitVoiceGender(text: string): VoiceGender | null {
  const normalized = text.toLowerCase();
  const masculine = /\b(he|him|his|man|male|boy|gentleman|father|brother|husband|son|mr)\b/.test(normalized);
  const feminine = /\b(she|her|hers|woman|female|girl|lady|mother|sister|wife|daughter|mrs|ms)\b/.test(normalized);
  if (masculine && !feminine) return "masculine";
  if (feminine && !masculine) return "feminine";
  return null;
}

export function suggestedCharacterName(input: {
  archetype: Archetype;
  characterBrief: string;
  voiceGender: VoiceGender;
}) {
  const gender = explicitVoiceGender(input.characterBrief) ?? input.voiceGender;
  const pool = GIVEN_NAMES[gender][input.archetype] ?? GIVEN_NAMES[gender].hero;
  const seedText = `${input.characterBrief}|${input.archetype}|${gender}`;
  const givenName = pool[seededIndex(seedText, pool.length)];
  const surname = SURNAMES[seededIndex(`${seedText}|surname`, SURNAMES.length)];
  return `${givenName} ${surname}`;
}

export function coherentGeneratedCharacterName(input: {
  creatorName: string;
  modelName: string;
  archetype: Archetype;
  characterBrief: string;
  voiceGender: VoiceGender;
}) {
  if (input.creatorName.trim()) return input.creatorName.trim();
  const modelName = input.modelName.trim();
  // The streamed model name is already visible to the creator while the actor
  // is being written. Treat that first complete name as canon instead of
  // replacing it during finalization with the small local fallback list.
  // Besides making the modal and saved actor disagree, that replacement erased
  // cultural context (for example, a Russian cosmonaut became Dev Rao).
  if (modelName) return modelName;
  const requiredGender = explicitVoiceGender(input.characterBrief);
  return suggestedCharacterName({
    ...input,
    voiceGender: requiredGender ?? input.voiceGender,
  });
}

export function alignVoiceDescription(description: string, voiceGender: VoiceGender) {
  if (voiceGender === "masculine") {
    return description
      .replace(/\bfeminine\b/gi, "masculine")
      .replace(/\bfemale\b/gi, "male")
      .replace(/\bwoman(?:'s)?\b/gi, (value) => value.toLowerCase().endsWith("'s") ? "man's" : "man");
  }
  if (voiceGender === "feminine") {
    return description
      .replace(/\bmasculine\b/gi, "feminine")
      .replace(/\bmale\b/gi, "female")
      .replace(/\bman(?:'s)?\b/gi, (value) => value.toLowerCase().endsWith("'s") ? "woman's" : "woman");
  }
  return description
    .replace(/\b(feminine|masculine)\b/gi, "androgynous")
    .replace(/\b(female|male)\b/gi, "gender-neutral");
}
