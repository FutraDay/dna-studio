import type { CampaignStrategy, GeneratedCampaign } from "./generator";

const CLICHE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bimagine a world\b/gi, "a better workflow can start"],
  [/\bgame changer\b/gi, "practical improvement"],
  [/\brevolutionize your business\b/gi, "improve the way your business operates"],
  [/\bunlock the power\b/gi, "use"],
  [/\bmaking your head spin\b/gi, "creating unnecessary complexity"],
  [/\bpain into gains\b/gi, "friction into progress"],
  [/\bautomation (?:isn't|is not) just a buzzword\b/gi, "automation is useful when it removes real work"],
  [/\bbusiness necessity\b/gi, "practical operational tool"],
  [/\bit(?:'s| is) time for a change\b/gi, "a better workflow is possible"],
  [/\bthink again\b/gi, "another approach is available"],
  [/\bwhy settle for\b/gi, "there is no need to default to"],
  [/\bcurious about\b/gi, "exploring"],
  [/\bworried about\b/gi, "concerned about"],
  [/\bthinking about\b/gi, "considering"],
  [/\bever wondered\b/gi, "a useful point to consider is"],
  [/\bready to\b/gi, "the next step can be to"],
  [/\btired of\b/gi, "dealing with"],
];
const LEADS: Record<CampaignStrategy, Record<string, string>> = {
  problem_awareness: {
    instagram: "Everyday workflow friction is visible in the tasks people repeat.",
    linkedin: "Operational drag often begins with routine manual work.",
    facebook: "Small admin tasks become a bigger problem when they pile up.",
    twitter: "Routine workflow friction compounds when manual steps stay in the process.",
  },
  education: {
    instagram: "A practical process review starts with the work happening every day.",
    linkedin: "Useful automation decisions start with a clear view of the workflow.",
    facebook: "The easiest place to start is the task that keeps taking time every week.",
    twitter: "Good automation starts with a specific workflow, not a technology label.",
  },
  proof_trust: {
    instagram: "A clear build process makes custom software easier to understand.",
    linkedin: "Transparency makes a software solution easier to evaluate before committing.",
    facebook: "Seeing how a solution is planned makes the decision much easier to assess.",
    twitter: "A transparent process matters as much as the software it produces.",
  },
  solution_product: {
    instagram: "Software works best when it reflects the way the work is actually done.",
    linkedin: "A system should fit the operating model rather than force workarounds around it.",
    facebook: "The right software should make the existing work simpler, not add another layer.",
    twitter: "Useful software fits the workflow instead of forcing the workflow to fit the tool.",
  },
  conversion: {
    instagram: "The next useful step is identifying the workflow causing the most friction.",
    linkedin: "A sensible first step is defining the operational bottleneck before choosing a solution.",
    facebook: "A better system starts by identifying the job that keeps slowing the day down.",
    twitter: "Start with the bottleneck, then decide what should be automated or rebuilt.",
  },
};

function startsWithQuestion(caption: string): boolean {
  const opening = caption.trim().replace(/\s+/g, " ").slice(0, 140);
  const question = opening.indexOf("?");
  const statementStop = opening.search(/[.!]/);
  return question >= 0 && (statementStop < 0 || question < statementStop);
}

function normalizeHashtagSet(hashtags: string[]): string {
  return hashtags.map((tag) => tag.replace(/^#/, "").toLowerCase()).filter(Boolean).sort().join("|");
}
function replaceCliches(caption: string): string {
  return CLICHE_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) =>
      text.replace(pattern, (match) =>
        /^[A-Z]/.test(match)
          ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
          : replacement
      ),
    caption
  );
}

export function normalizeCampaignStyle(campaign: GeneratedCampaign): GeneratedCampaign {
  const seenHashtagSets = new Set<string>();
  let questionHooksKept = 0;

  return {
    concepts: campaign.concepts.map((concept) => ({
      ...concept,
      assets: concept.assets.map((asset) => {
        let caption = replaceCliches(asset.caption);
        if (startsWithQuestion(caption)) {
          if (questionHooksKept < 2) questionHooksKept += 1;
          else {
            const strategy = concept.strategy ?? "problem_awareness";
            const lead = LEADS[strategy]?.[asset.platform] ?? "The practical issue starts with the workflow.";
            caption = `${lead} ${caption}`;
          }
        }

        let hashtags = [...asset.hashtags];
        let hashtagKey = normalizeHashtagSet(hashtags);
        while (hashtagKey && seenHashtagSets.has(hashtagKey) && hashtags.length > 0) {
          hashtags = hashtags.slice(0, -1);
          hashtagKey = normalizeHashtagSet(hashtags);
        }
        if (hashtagKey) seenHashtagSets.add(hashtagKey);

        return { ...asset, caption, hashtags };
      }),
    })),
  };
}
