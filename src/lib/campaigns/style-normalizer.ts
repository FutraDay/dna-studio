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


const CTA_VARIANTS: Record<CampaignStrategy, Record<string, string>> = {
  problem_awareness: {
    instagram: "Notice the repeated task that keeps interrupting the day.",
    linkedin: "Identify the manual step creating the most operational drag.",
    facebook: "Pick the admin task your team would most like to stop repeating.",
    twitter: "Start with the manual step that keeps coming back.",
  },
  education: {
    instagram: "Map one workflow from start to finish before choosing what to automate.",
    linkedin: "Document the current process before deciding where automation belongs.",
    facebook: "Write down the steps in one recurring job and look for the repeated parts.",
    twitter: "Map the workflow first; automate the repeated step second.",
  },
  proof_trust: {
    instagram: "Look for a build process you can understand before committing.",
    linkedin: "Ask how the workflow, decisions and handoffs will be documented.",
    facebook: "Choose a process that shows you how the solution will be planned and built.",
    twitter: "Evaluate the process as carefully as the finished software.",
  },
  solution_product: {
    instagram: "List the workaround your current software forces you to repeat.",
    linkedin: "Define where generic software conflicts with the operating model.",
    facebook: "Describe the part of your current system that makes the job harder than it should be.",
    twitter: "Name the workaround your current software keeps forcing on the team.",
  },
  conversion: {
    instagram: "Tell FutraDay which workflow is slowing the business down most.",
    linkedin: "Share the operational bottleneck you would fix first.",
    facebook: "Tell FutraDay what keeps taking too much time in the business.",
    twitter: "Start with the bottleneck you would remove first.",
  },
};

const VISUAL_SCENES: Record<CampaignStrategy, Record<string, string>> = {
  problem_awareness: {
    instagram: "Premium editorial scene of an Australian tradie at a workshop bench surrounded by paper forms, job notes and tools, dark modern FutraDay brand mood.",
    linkedin: "Professional Australian service-business team reviewing a wall of process notes and duplicated paperwork in a modern office, premium dark editorial lighting.",
    facebook: "Relatable small-business owner sorting invoices, quote sheets and handwritten follow-up notes at a busy worktable, polished realistic photography.",
    twitter: "Close editorial composition of repeated paper forms, job sheets and sticky notes representing workflow friction, premium dark technology brand aesthetic.",
  },
  education: {
    instagram: "Top-down editorial scene of a simple workflow mapped with cards, arrows and labelled steps on a dark table, clean premium FutraDay aesthetic.",
    linkedin: "Business team mapping a process on a glass wall with clear stages and handoffs, sophisticated Australian B2B photography.",
    facebook: "Small service-business team using printed workflow cards to identify repetitive admin steps, approachable realistic scene.",
    twitter: "Minimal process map made from physical cards and arrows, one repeated step highlighted, dark premium brand styling.",
  },
  proof_trust: {
    instagram: "Behind-the-scenes product planning session with sketches, user-flow cards and annotated requirements on a dark studio table, premium editorial photography.",
    linkedin: "Software planning workshop showing stakeholders reviewing requirements, process diagrams and implementation notes in a modern meeting space.",
    facebook: "Friendly collaborative planning scene with a business owner and developer reviewing printed workflow diagrams and project notes.",
    twitter: "Clean close-up of annotated requirements, process cards and build stages arranged as a transparent development workflow.",
  },
  solution_product: {
    instagram: "Australian field-service workflow shown through a tradie moving from job notes to completed work with fewer manual handoffs, cinematic premium photography.",
    linkedin: "Operations team following a streamlined custom workflow across quoting, scheduling and follow-up using physical process markers, modern B2B scene.",
    facebook: "Service-business owner moving smoothly through quote, booking and follow-up tasks in a realistic workplace, practical and approachable mood.",
    twitter: "Before-and-after workflow composition: cluttered manual steps on one side, simplified connected process cards on the other, premium dark aesthetic.",
  },
  conversion: {
    instagram: "Business owner pointing to one bottleneck on a mapped workflow while planning the next improvement, confident premium dark FutraDay aesthetic.",
    linkedin: "Decision-making workshop focused on one operational bottleneck, with clear process notes and priorities on a wall, polished professional photography.",
    facebook: "Small-business owner and consultant identifying the single task causing the most friction using printed job-flow notes, realistic collaborative scene.",
    twitter: "One highlighted bottleneck card at the centre of a clean workflow map, minimal premium composition with dark FutraDay styling.",
  },
};

const EVIDENCE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b(?:our\s+)?(?:latest\s+)?case stud(?:y|ies)\b/gi, "a hypothetical workflow example"],
  [/\b(?:customer|client|business)\s+(?:success|case)\s+stor(?:y|ies)\b/gi, "a hypothetical workflow example"],
  [/\bsuccess stor(?:y|ies)\b/gi, "a workflow example"],
  [/\bsee how we (?:helped|transformed|streamlined|improved|saved)\b/gi, "see how a tailored system could help"],
  [/\b(?:we|we've|we have)\s+(?:helped|worked with|partnered with|supported)\b/gi, "a tailored system can support"],
  [/\bpartnered with us\b/gi, "could use a tailored system"],
  [/\b(?:a|the|our)\s+(?:local\s+|small\s+)?business\s+(?:partnered|worked|used|adopted|implemented|transformed|streamlined|saved|reduced|increased|boosted|improved)\b/gi, "for example, a hypothetical business could improve"],
];

const VISUAL_DEVICE_TERMS = /\b(?:dashboard|laptop|monitor|screen|device|interface|chart)\b/i;
const SIMILARITY_STOP_WORDS = new Set(["about","after","again","also","business","custom","from","generic","into","more","only","other","service","software","solution","system","that","their","them","then","these","they","this","through","using","what","when","where","which","with","without","work","works","your"]);

function textTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length >= 4 && !SIMILARITY_STOP_WORDS.has(token)));
}

function similarity(left: string, right: string): { shared: number; score: number } {
  const a = textTokens(left);
  const b = textTokens(right);
  if (!a.size || !b.size) return { shared: 0, score: 0 };
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  const union = a.size + b.size - shared;
  return { shared, score: union ? shared / union : 0 };
}

function shortenCaption(value: string, maxLength: number): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= maxLength) return compact;

  const slice = compact.slice(0, maxLength - 1).trimEnd();
  const wordBreak = slice.lastIndexOf(" ");
  const candidate = wordBreak >= Math.floor(maxLength * 0.7) ? slice.slice(0, wordBreak) : slice;
  return `${candidate.replace(/[,:;!?-]+$/g, "").trimEnd()}…`;
}

function startsWithQuestion(caption: string): boolean {
  const opening = caption.trim().replace(/\s+/g, " ").slice(0, 140);
  const question = opening.indexOf("?");
  const statementStop = opening.search(/[.!]/);
  return question >= 0 && (statementStop < 0 || question < statementStop);
}

function coerceHashtags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
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

  const concepts = Array.isArray(campaign?.concepts) ? campaign.concepts : [];

  return {
    concepts: concepts.map((concept) => ({
      ...concept,
      assets: (Array.isArray(concept?.assets) ? concept.assets : []).map((asset) => {
        let caption = replaceCliches(typeof asset?.caption === "string" ? asset.caption : "");
        if (startsWithQuestion(caption)) {
          if (questionHooksKept < 2) questionHooksKept += 1;
          else {
            const strategy = concept.strategy ?? "problem_awareness";
            const lead = LEADS[strategy]?.[asset.platform] ?? "The practical issue starts with the workflow.";
            caption = `${lead} ${caption}`;
          }
        }

        let hashtags = coerceHashtags(asset?.hashtags);
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

export function repairCampaignDeterministically(
  campaign: GeneratedCampaign,
  issues: Array<{ code?: string; message: string }>
): GeneratedCampaign {
  const codes = new Set(issues.map((issue) => issue.code).filter(Boolean));
  const quoted = (code: string) => issues
    .filter((issue) => issue.code === code)
    .map((issue) => issue.message.match(/"([^"]+)"/)?.[1])
    .filter((value): value is string => Boolean(value));

  const metricPhrases = quoted("unsupported_metric");
  const entityPhrases = quoted("unsupported_entity");
  const offerPhrases = quoted("unsupported_offer");
  const resourcePhrases = quoted("unsupported_resource");
  const base = normalizeCampaignStyle(campaign);

  const concepts = base.concepts.map((concept) => {
    const strategy = concept.strategy ?? "problem_awareness";
    let assets = concept.assets.map((asset) => {
      let caption = asset.caption;

      if (codes.has("unsupported_evidence_claim")) {
        for (const [pattern, replacement] of EVIDENCE_REPLACEMENTS) {
          caption = caption.replace(pattern, replacement);
        }
      }
      for (const metric of metricPhrases) caption = caption.split(metric).join("a meaningful amount");
      for (const entity of entityPhrases) caption = caption.split(entity).join("a hypothetical business");
      for (const offer of offerPhrases) caption = caption.split(offer).join("a practical next step");
      for (const resource of resourcePhrases) caption = caption.split(resource).join("an inline example");

      const cta = codes.has("repeated_cta")
        ? CTA_VARIANTS[strategy]?.[asset.platform] ?? (typeof asset.cta === "string" ? asset.cta : "Review the next practical step.")
        : typeof asset.cta === "string" ? asset.cta : "";

      const currentPrompt = typeof asset.imagePrompt === "string" ? asset.imagePrompt : "";
      const imagePrompt = codes.has("repetitive_visuals") && VISUAL_DEVICE_TERMS.test(currentPrompt)
        ? VISUAL_SCENES[strategy]?.[asset.platform] ?? "Premium editorial scene showing a practical business workflow in a realistic Australian small-business environment."
        : currentPrompt;

      return { ...asset, caption, cta, imagePrompt };
    });

    const needsPlatformSeparation = codes.has("cross_platform_similarity") || codes.has("repeated_hook");
    if (needsPlatformSeparation) {
      const hasSimilarPair = codes.has("repeated_hook") || assets.some((left, leftIndex) =>
        assets.slice(leftIndex + 1).some((right) => {
          const result = similarity(left.caption, right.caption);
          return result.shared >= 5 && result.score >= 0.65;
        })
      );
      if (hasSimilarPair) {
        assets = assets.map((asset) => {
          const lead = LEADS[strategy]?.[asset.platform] ?? "The practical issue starts with the workflow.";
          return {
            ...asset,
            caption: asset.caption.startsWith(lead) ? asset.caption : `${lead} ${asset.caption}`,
          };
        });
      }
    }

    assets = assets.map((asset) =>
      asset.platform === "twitter"
        ? { ...asset, caption: shortenCaption(asset.caption, 280) }
        : asset
    );

    return { ...concept, assets };
  });

  return normalizeCampaignStyle({ concepts });
}
