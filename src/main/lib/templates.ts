import type { WorkflowTemplate } from "@shared/types"

// ── Template 1: Deep Research ─────────────────────────────
// Pattern: input → splitter → researcher (parallel) → merger → output

const deepResearch: WorkflowTemplate = {
  id: "deep-research",
  name: "Deep Research",
  description:
    "Decompose a topic into research aspects, investigate each in parallel, synthesize into a comprehensive report",
  category: "research",
  tags: ["research", "fan-out", "parallel", "synthesis"],
  workflow: {
    version: 1,
    name: "Deep Research",
    description:
      "Decompose a topic into research aspects, investigate each in parallel, synthesize into a comprehensive report",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 300, y: 200 },
        config: {
          strategy:
            "Decompose this research topic into independent aspects that can be researched separately. Each aspect should be a self-contained research question.",
          maxBranches: 8,
        },
      },
      {
        id: "researcher-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "researcher",
          prompt:
            "Research this aspect thoroughly. Find credible sources, key data points, expert opinions, and emerging trends. Prioritize primary sources and recent publications.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 900, y: 200 },
        config: {
          strategy: "summarize",
          prompt:
            "Synthesize all research findings into a comprehensive, well-structured report. Include an executive summary, key findings per aspect, cross-cutting themes, and actionable conclusions.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1200, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-splitter", source: "input-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-researcher", source: "splitter-1", target: "researcher-1", type: "default" },
      { id: "e-researcher-merger", source: "researcher-1", target: "merger-1", type: "default" },
      { id: "e-merger-output", source: "merger-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 2: Landing Page Audit Loop ───────────────────
// Pattern: input → validator → visual → rewriter → evaluator → output (pass) / validator (fail)

const landingAuditLoop: WorkflowTemplate = {
  id: "landing-audit-loop",
  name: "Landing Page Audit Loop",
  description:
    "Analyze a landing page using JTBD framework, evaluate visual design, rewrite copy, iterate until quality threshold met",
  category: "marketing",
  tags: ["landing", "audit", "JTBD", "loop", "conversion"],
  workflow: {
    version: 1,
    name: "Landing Page Audit Loop",
    description:
      "Analyze a landing page using JTBD framework, evaluate visual design, rewrite copy, iterate until quality threshold met",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "validator-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "landing-validator",
          prompt:
            "Analyze this landing page against Jobs-To-Be-Done framework. Evaluate: Does the hero address the primary job? Are features framed as outcomes? Is the CTA aligned with the user's desired progress? Score each section.",
        },
      },
      {
        id: "visual-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "visual-analyzer",
          prompt:
            "Analyze the visual design and UX of this landing page. Evaluate: visual hierarchy, readability, trust signals, mobile responsiveness, CTA visibility. Provide specific improvement recommendations.",
        },
      },
      {
        id: "rewriter-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "landing-rewriter",
          prompt:
            "Based on the JTBD analysis and visual audit feedback, rewrite the landing page copy. Focus on: clear value proposition, outcome-focused features, compelling CTA, social proof integration.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Use infostyle + slop-check gate for landing copy. Score 1-10 on: JTBD alignment (does copy address real jobs?), conversion clarity (is the path to action obvious?), infostyle quality (facts/utility over emotional manipulation), and slop risk (generic AI phrasing, weak causality, filler). Return concrete rewrite instructions for failing sections.",
          threshold: 8,
          maxRetries: 3,
          retryFrom: "validator-1",
          skillRefs: ["infostyle", "slop-check"],
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1500, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-validator", source: "input-1", target: "validator-1", type: "default" },
      { id: "e-validator-visual", source: "validator-1", target: "visual-1", type: "default" },
      { id: "e-visual-rewriter", source: "visual-1", target: "rewriter-1", type: "default" },
      { id: "e-rewriter-evaluator", source: "rewriter-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-validator", source: "evaluator-1", target: "validator-1", type: "fail" },
    ],
  },
}

// ── Template 3: Segment Research with Quality Gate ────────
// Pattern: input → splitter → researcher (parallel) → merger → evaluator → output (pass) / splitter (fail)

const segmentResearchGate: WorkflowTemplate = {
  id: "segment-research-gate",
  name: "Segment Research with Quality Gate",
  description:
    "Generate segment hypotheses, research each in parallel with signal grounding, score and filter by quality gate",
  category: "research",
  tags: ["segments", "fan-out", "scoring", "quality-gate"],
  workflow: {
    version: 1,
    name: "Segment Research with Quality Gate",
    description:
      "Generate segment hypotheses, research each in parallel with signal grounding, score and filter by quality gate",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 300, y: 200 },
        config: {
          strategy:
            "Identify 6-10 distinct market segments or user personas. For each, define: name, primary job-to-be-done, key triggers, and initial hypothesis about their needs.",
          maxBranches: 8,
        },
      },
      {
        id: "researcher-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "segment-researcher",
          prompt:
            "Research this market segment deeply. Find: real user signals (complaints, requests, workarounds), quantitative data (market size, growth), competitive landscape, and unmet needs. Grade source quality (S=primary, A=expert, B=aggregator, C=promotional, D=content farm).",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 900, y: 200 },
        config: {
          strategy: "summarize",
          prompt:
            "Compile all segment research into a scored summary. For each segment: confidence score (1-10), signal count, source quality distribution, key findings. Rank segments by research confidence.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Score 1-10 the overall research quality: signal diversity (multiple source types?), grounding depth (real evidence vs speculation?), segment differentiation (are segments truly distinct?), actionability (can we act on findings?)",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "splitter-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1500, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-splitter", source: "input-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-researcher", source: "splitter-1", target: "researcher-1", type: "default" },
      { id: "e-researcher-merger", source: "researcher-1", target: "merger-1", type: "default" },
      { id: "e-merger-evaluator", source: "merger-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-splitter", source: "evaluator-1", target: "splitter-1", type: "fail" },
    ],
  },
}

// ── Template 4: Content Pipeline ──────────────────────────
// Pattern: input → strategist → report → marketing → evaluator → output (pass) / strategist (fail)

const contentPipeline: WorkflowTemplate = {
  id: "content-pipeline",
  name: "Content Pipeline",
  description:
    "Develop product strategy, generate comprehensive report, create marketing artifacts, evaluate quality",
  category: "content",
  tags: ["content", "strategy", "report", "marketing", "loop"],
  workflow: {
    version: 1,
    name: "Content Pipeline",
    description:
      "Develop product strategy, generate comprehensive report, create marketing artifacts, evaluate quality",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "strategist-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "strategist",
          prompt:
            "Develop a product strategy based on the input. Cover: positioning, key differentiators, target audience messaging, feature prioritization, and go-to-market approach.",
        },
      },
      {
        id: "report-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "report-generator",
          prompt:
            "Generate a comprehensive report synthesizing the strategy. Include: executive summary, market analysis, strategic recommendations, implementation roadmap, and risk assessment.",
        },
      },
      {
        id: "marketing-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "marketing-generator",
          prompt:
            "Create marketing artifacts from the strategy and report: positioning statements, value propositions, messaging framework for each target segment, and content ideas matrix.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Score 1-10 on: strategic coherence (does everything align?), market grounding (based on real data?), actionability (clear next steps?), completeness (no major gaps?)",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "strategist-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1500, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-strategist", source: "input-1", target: "strategist-1", type: "default" },
      { id: "e-strategist-report", source: "strategist-1", target: "report-1", type: "default" },
      { id: "e-report-marketing", source: "report-1", target: "marketing-1", type: "default" },
      { id: "e-marketing-evaluator", source: "marketing-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-strategist", source: "evaluator-1", target: "strategist-1", type: "fail" },
    ],
  },
}

// ── Template 5: Lead Research Machine ─────────────────────
// Pattern: input → market-research → splitter → lead-research [parallel] → merger → output

const leadResearchMachine: WorkflowTemplate = {
  id: "lead-research-machine",
  name: "Lead Research Machine",
  description:
    "Research a market vertical, fan out into segments, find leads in parallel, compile a prioritized list",
  category: "marketing",
  tags: ["leads", "research", "fan-out", "outbound"],
  workflow: {
    version: 1,
    name: "Lead Research Machine",
    description:
      "Research a market vertical, fan out into segments, find leads in parallel, compile a prioritized list",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "research-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "gtm/market-research",
          prompt:
            "Research this market vertical. Find key pain points, buying triggers, and decision-maker profiles.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 600, y: 200 },
        config: {
          strategy:
            "Identify 4-6 distinct market segments to research leads in. Each segment should target different company types or buyer personas.",
        },
      },
      {
        id: "lead-finder-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "composio/lead-research-assistant",
          prompt:
            "Find high-quality leads for this segment. Research companies, find decision makers, provide contact info and personalization hooks.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1200, y: 200 },
        config: {
          strategy: "summarize",
          prompt:
            "Compile all leads into a prioritized list. Group by segment, include research quality scores, and highlight top 10 highest-potential leads.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1500, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-research", source: "input-1", target: "research-1", type: "default" },
      { id: "e-research-splitter", source: "research-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-leadfinder", source: "splitter-1", target: "lead-finder-1", type: "default" },
      { id: "e-leadfinder-merger", source: "lead-finder-1", target: "merger-1", type: "default" },
      { id: "e-merger-output", source: "merger-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 6: Content Repurposing Factory ───────────────
// Pattern: input → content-analyzer → splitter → platform-writer [parallel] → merger → evaluator → output

const contentRepurposingFactory: WorkflowTemplate = {
  id: "content-repurposing-factory",
  name: "Content Repurposing Factory",
  description:
    "Analyze content, fan out into platform-specific rewrites, compile all versions, evaluate quality",
  category: "content",
  tags: ["content", "social", "fan-out", "repurposing"],
  workflow: {
    version: 1,
    name: "Content Repurposing Factory",
    description:
      "Analyze content, fan out into platform-specific rewrites, compile all versions, evaluate quality",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "analyzer-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "marketing/Content Creator",
          prompt:
            "Analyze this content. Extract key ideas, main argument, supporting data, and quotable moments. Identify the core message.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 600, y: 200 },
        config: {
          strategy:
            "Split into 4 platform-specific content tasks: Twitter thread, LinkedIn post, Instagram caption, and email newsletter intro. Each should be a self-contained rewriting task.",
        },
      },
      {
        id: "writer-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "marketing/Social Media Strategist",
          prompt:
            "Adapt the content for this specific platform. Match the platform's tone, format, and best practices. Make it native, not just reformatted.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1200, y: 200 },
        config: {
          strategy: "concatenate",
          prompt:
            "Compile all platform versions with clear headers. Include character counts and posting recommendations.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1500, y: 200 },
        config: {
          criteria:
            "Score 1-10 on: platform-native tone (not generic AI), consistency of core message across versions, actionability (clear CTAs), and engagement potential.",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "analyzer-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-analyzer", source: "input-1", target: "analyzer-1", type: "default" },
      { id: "e-analyzer-splitter", source: "analyzer-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-writer", source: "splitter-1", target: "writer-1", type: "default" },
      { id: "e-writer-merger", source: "writer-1", target: "merger-1", type: "default" },
      { id: "e-merger-evaluator", source: "merger-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-analyzer", source: "evaluator-1", target: "analyzer-1", type: "fail" },
    ],
  },
}

// ── Template 7: Predictable Text Factory ───────────────────
// Pattern: input → planner → splitter → section-writer → section-evaluator
//          → merger(raw assembly) → integrator → final-evaluator → output
//          with retry loops on section and final quality gates

const predictableTextFactory: WorkflowTemplate = {
  id: "predictable-text-factory",
  name: "Predictable Text Factory",
  description:
    "Deterministic text pipeline with section-level decomposition, independent processing, embedded quality gates, and iterative refinement loops",
  category: "content",
  tags: ["factory", "decomposition", "quality-gate", "iteration", "fan-out"],
  workflow: {
    version: 1,
    name: "Predictable Text Factory",
    description:
      "Plan sections, process each section independently, run section-level and final quality gates, iterate until pass",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 45,
      maxParallel: 6,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "planner-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "factory/text-planner",
          prompt:
            "Turn the source text into a production plan. Define 5-10 sections in strict order. For each section include: section_id, objective, must_keep_facts, constraints, and done_criteria. Output as structured markdown so each section can be executed independently.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 600, y: 200 },
        config: {
          strategy:
            "Split the plan into independent section tasks. Each task must include full local context: section_id, objective, required facts, constraints, done_criteria, and section order index.",
          maxBranches: 10,
        },
      },
      {
        id: "section-writer-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "factory/section-writer",
          prompt:
            "Produce ONE final draft for this section only. Respect objective and constraints exactly, preserve required facts, avoid adding unsupported claims, and keep the section self-contained.",
        },
      },
      {
        id: "section-evaluator-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Gate each section with infostyle + slop-check. Score 1-10 on: (1) requirement adherence (objective + constraints), (2) factual integrity (all required facts preserved, no invented claims), (3) infostyle discipline (facts, no buzzwords/manipulation, no padding), (4) slop risk (generic AI phrasing, fake confidence, weak causality, low detail density). Hard fail if verdict is probable_slop or infostyle bans are violated. Return specific sentence-level rewrite instructions.",
          threshold: 8,
          maxRetries: 3,
          retryFrom: "section-writer-1",
          skillRefs: ["infostyle", "slop-check"],
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1500, y: 200 },
        config: {
          strategy: "concatenate",
          prompt:
            "Assemble passed sections in original order without rewriting content. Keep section boundaries explicit.",
        },
      },
      {
        id: "integrator-1",
        type: "skill",
        position: { x: 1800, y: 200 },
        config: {
          skillRef: "factory/text-integrator",
          prompt:
            "Integrate assembled sections into one coherent text. Only do cross-section normalization: transitions, terminology consistency, duplicate removal, and ordering. Do not drop required facts.",
        },
      },
      {
        id: "final-evaluator-1",
        type: "evaluator",
        position: { x: 2100, y: 200 },
        config: {
          criteria:
            "Final gate: check if the document is publishable (not slop). Score 1-10 on: (1) coherence across sections, (2) consistency of terminology and claims, (3) infostyle quality end-to-end (facts/utility, no manipulative fluff), (4) slop-check verdict across the whole text (clean/good/acceptable/probable_slop). PASS only if text is clean or good and requires no manual structural rewrites.",
          threshold: 8,
          maxRetries: 2,
          retryFrom: "planner-1",
          skillRefs: ["infostyle", "slop-check"],
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 2400, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-planner", source: "input-1", target: "planner-1", type: "default" },
      { id: "e-planner-splitter", source: "planner-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-section-writer", source: "splitter-1", target: "section-writer-1", type: "default" },
      { id: "e-section-writer-eval", source: "section-writer-1", target: "section-evaluator-1", type: "default" },
      { id: "e-section-eval-merger", source: "section-evaluator-1", target: "merger-1", type: "pass" },
      { id: "e-section-eval-writer", source: "section-evaluator-1", target: "section-writer-1", type: "fail" },
      { id: "e-merger-integrator", source: "merger-1", target: "integrator-1", type: "default" },
      { id: "e-integrator-final-eval", source: "integrator-1", target: "final-evaluator-1", type: "default" },
      { id: "e-final-eval-output", source: "final-evaluator-1", target: "output-1", type: "pass" },
      { id: "e-final-eval-planner", source: "final-evaluator-1", target: "planner-1", type: "fail" },
    ],
  },
}

// ── Template 7: Cold Outreach Pipeline ────────────────────
// Pattern: input → context → hypotheses → email-prompt → email-gen → simulator → evaluator → output

const coldOutreachPipeline: WorkflowTemplate = {
  id: "cold-outreach-pipeline",
  name: "Cold Outreach Pipeline",
  description:
    "Build company context, generate pain hypotheses, craft email templates, generate personalized emails, simulate buyer response, evaluate quality",
  category: "marketing",
  tags: ["outbound", "email", "sales", "pipeline"],
  workflow: {
    version: 1,
    name: "Cold Outreach Pipeline",
    description:
      "Build company context, generate pain hypotheses, craft email templates, generate personalized emails, simulate buyer response, evaluate quality",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "context-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "gtm/context-building",
          prompt:
            "Build a complete company context: product info, ICP, value props, competitive advantages, proof points.",
        },
      },
      {
        id: "hypotheses-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "gtm/hypothesis-building",
          prompt:
            "Generate 5-8 testable pain hypotheses from the company context. Focus on specific, provable pains the ICP faces.",
        },
      },
      {
        id: "email-prompt-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "gtm/email-prompt-building",
          prompt:
            "Create a self-contained email prompt template for cold outreach. Include voice rules, personalization tokens, and campaign angle.",
        },
      },
      {
        id: "email-gen-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "gtm/email-generation",
          prompt:
            "Generate 5 personalized cold emails using the template. Each should feel hand-written, not templated.",
        },
      },
      {
        id: "simulator-1",
        type: "skill",
        position: { x: 1500, y: 200 },
        config: {
          skillRef: "gtm/email-response-simulation",
          prompt:
            "Simulate a skeptical buyer reading each email. Score reply likelihood, identify objections, suggest improvements.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1800, y: 200 },
        config: {
          criteria:
            "Score 1-10: personalization depth (not just name-swaps), pain relevance (does it hit real problems?), CTA clarity, and spam-filter safety.",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "email-prompt-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 2100, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-context", source: "input-1", target: "context-1", type: "default" },
      { id: "e-context-hypotheses", source: "context-1", target: "hypotheses-1", type: "default" },
      { id: "e-hypotheses-emailprompt", source: "hypotheses-1", target: "email-prompt-1", type: "default" },
      { id: "e-emailprompt-emailgen", source: "email-prompt-1", target: "email-gen-1", type: "default" },
      { id: "e-emailgen-simulator", source: "email-gen-1", target: "simulator-1", type: "default" },
      { id: "e-simulator-evaluator", source: "simulator-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-emailprompt", source: "evaluator-1", target: "email-prompt-1", type: "fail" },
    ],
  },
}

// ── Template 8: Competitor Ad Intelligence ────────────────
// Pattern: input → splitter → ad-extractor [parallel] → merger → strategist → pptx → output

const competitorAdIntelligence: WorkflowTemplate = {
  id: "competitor-ad-intelligence",
  name: "Competitor Ad Intelligence",
  description:
    "Split competitors, extract ad strategies in parallel, synthesize findings, develop counter-positioning, create presentation",
  category: "research",
  tags: ["competitive", "ads", "fan-out", "analysis"],
  workflow: {
    version: 1,
    name: "Competitor Ad Intelligence",
    description:
      "Split competitors, extract ad strategies in parallel, synthesize findings, develop counter-positioning, create presentation",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 300, y: 200 },
        config: {
          strategy:
            "Split input into individual competitor companies to analyze. Each should be one company URL or name.",
        },
      },
      {
        id: "extractor-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "composio/competitive-ads-extractor",
          prompt:
            "Extract and analyze this competitor's ads: messaging, problems they target, creative approaches, CTAs, and positioning.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 900, y: 200 },
        config: {
          strategy: "summarize",
          prompt:
            "Synthesize all competitor analyses into a strategic competitive overview. Identify messaging gaps, overused angles, and differentiation opportunities.",
        },
      },
      {
        id: "strategist-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "marketing/Growth Hacker",
          prompt:
            "Based on the competitive analysis, develop a counter-positioning strategy. Identify underserved angles, messaging opportunities, and campaign ideas that exploit competitor gaps.",
        },
      },
      {
        id: "pptx-1",
        type: "skill",
        position: { x: 1500, y: 200 },
        config: {
          skillRef: "anthropic/pptx",
          prompt:
            "Create a competitive intelligence presentation with: executive summary slide, per-competitor breakdown, gap analysis, and recommended strategy.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-splitter", source: "input-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-extractor", source: "splitter-1", target: "extractor-1", type: "default" },
      { id: "e-extractor-merger", source: "extractor-1", target: "merger-1", type: "default" },
      { id: "e-merger-strategist", source: "merger-1", target: "strategist-1", type: "default" },
      { id: "e-strategist-pptx", source: "strategist-1", target: "pptx-1", type: "default" },
      { id: "e-pptx-output", source: "pptx-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 9: Meeting → Actions → Plan ──────────────────
// Pattern: input → analyzer → summarizer → splitter → project-manager [parallel] → merger → docx → output

const meetingActionsPlan: WorkflowTemplate = {
  id: "meeting-actions-plan",
  name: "Meeting → Actions → Plan",
  description:
    "Analyze meeting transcript, extract action items, prioritize and plan each in parallel, compile into a project document",
  category: "general",
  tags: ["meetings", "actions", "fan-out", "productivity"],
  workflow: {
    version: 1,
    name: "Meeting → Actions → Plan",
    description:
      "Analyze meeting transcript, extract action items, prioritize and plan each in parallel, compile into a project document",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "analyzer-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "composio/meeting-insights-analyzer",
          prompt:
            "Analyze this meeting transcript. Identify key decisions, action items, unresolved questions, and behavioral patterns.",
        },
      },
      {
        id: "summarizer-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "support/Executive Summary Generator",
          prompt:
            "Create a concise executive summary of the meeting: key outcomes, decisions made, and strategic implications.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 900, y: 200 },
        config: {
          strategy:
            "Extract each distinct action item as a separate task to be prioritized and planned.",
        },
      },
      {
        id: "pm-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "project-management/Senior Project Manager",
          prompt:
            "For this action item: estimate effort, assign priority (P0-P3), suggest owner based on meeting context, define acceptance criteria, and set a deadline.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1500, y: 200 },
        config: {
          strategy: "concatenate",
          prompt:
            "Compile all action items into a structured project plan. Sort by priority, group by owner, include timeline.",
        },
      },
      {
        id: "docx-1",
        type: "skill",
        position: { x: 1800, y: 200 },
        config: {
          skillRef: "anthropic/docx",
          prompt:
            "Create a professional meeting summary document with: executive summary, decisions log, prioritized action plan table, and next steps.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 2100, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-analyzer", source: "input-1", target: "analyzer-1", type: "default" },
      { id: "e-analyzer-summarizer", source: "analyzer-1", target: "summarizer-1", type: "default" },
      { id: "e-summarizer-splitter", source: "summarizer-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-pm", source: "splitter-1", target: "pm-1", type: "default" },
      { id: "e-pm-merger", source: "pm-1", target: "merger-1", type: "default" },
      { id: "e-merger-docx", source: "merger-1", target: "docx-1", type: "default" },
      { id: "e-docx-output", source: "docx-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 10: Invoice Chaos Fixer ──────────────────────
// Pattern: input → organizer → pdf-extractor → xlsx → finance-check → evaluator → output

const invoiceChaosFixer: WorkflowTemplate = {
  id: "invoice-chaos-fixer",
  name: "Invoice Chaos Fixer",
  description:
    "Organize invoices, extract data from PDFs, create expense spreadsheet, detect anomalies, evaluate completeness",
  category: "general",
  tags: ["invoices", "finance", "documents", "automation"],
  workflow: {
    version: 1,
    name: "Invoice Chaos Fixer",
    description:
      "Organize invoices, extract data from PDFs, create expense spreadsheet, detect anomalies, evaluate completeness",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "organizer-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "composio/invoice-organizer",
          prompt:
            "Scan this folder of invoices and receipts. Identify each document, extract key info (vendor, amount, date, category), rename files consistently.",
        },
      },
      {
        id: "pdf-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "anthropic/pdf",
          prompt:
            "Extract structured data from all PDF invoices: vendor name, invoice number, date, line items, totals, tax amounts, and payment terms.",
        },
      },
      {
        id: "xlsx-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "anthropic/xlsx",
          prompt:
            "Create a comprehensive expense spreadsheet with columns: Date, Vendor, Category, Amount, Tax, Total, Payment Status. Add a summary sheet with totals by category and month.",
        },
      },
      {
        id: "finance-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "support/Finance Tracker",
          prompt:
            "Review the expense data for anomalies: duplicate charges, unusual amounts, missing categories, tax deduction opportunities. Provide a financial summary.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1500, y: 200 },
        config: {
          criteria:
            "Score 1-10 on: data completeness (all invoices captured?), categorization accuracy, spreadsheet usability, and anomaly detection thoroughness.",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "organizer-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-organizer", source: "input-1", target: "organizer-1", type: "default" },
      { id: "e-organizer-pdf", source: "organizer-1", target: "pdf-1", type: "default" },
      { id: "e-pdf-xlsx", source: "pdf-1", target: "xlsx-1", type: "default" },
      { id: "e-xlsx-finance", source: "xlsx-1", target: "finance-1", type: "default" },
      { id: "e-finance-evaluator", source: "finance-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-organizer", source: "evaluator-1", target: "organizer-1", type: "fail" },
    ],
  },
}

// ── Template 11: Design → Code → Test ─────────────────────
// Pattern: input → designer → reviewer → evaluator(code) → tester → evaluator(tests) → output

const designCodeTest: WorkflowTemplate = {
  id: "design-code-test",
  name: "Design → Code → Test",
  description:
    "Generate frontend component, review code quality, gate on standards, write tests, gate on coverage",
  category: "code",
  tags: ["design", "frontend", "testing", "quality-gate"],
  workflow: {
    version: 1,
    name: "Design → Code → Test",
    description:
      "Generate frontend component, review code quality, gate on standards, write tests, gate on coverage",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "designer-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "anthropic/frontend-design",
          prompt:
            "Create a production-ready frontend component from this description. Use React, Tailwind CSS, and modern patterns. Focus on visual quality, accessibility, and responsiveness.",
        },
      },
      {
        id: "reviewer-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "dev/code-reviewer",
          prompt:
            "Review this component for: code quality, accessibility issues, performance concerns, naming conventions, and React best practices. Provide specific fix suggestions.",
        },
      },
      {
        id: "eval-code-1",
        type: "evaluator",
        position: { x: 900, y: 200 },
        config: {
          criteria:
            "Score 1-10: code quality (clean, idiomatic React), visual design (polished, not generic), accessibility (ARIA, keyboard nav), and responsiveness.",
          threshold: 8,
          maxRetries: 2,
          retryFrom: "designer-1",
        },
      },
      {
        id: "tester-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "anthropic/webapp-testing",
          prompt:
            "Write and run Playwright tests for this component. Cover: rendering, user interactions, responsive behavior, and edge cases.",
        },
      },
      {
        id: "eval-test-1",
        type: "evaluator",
        position: { x: 1500, y: 200 },
        config: {
          criteria:
            "Score 1-10: test coverage (all user paths?), test reliability (no flaky assertions?), edge case coverage, and assertion quality.",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "designer-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-designer", source: "input-1", target: "designer-1", type: "default" },
      { id: "e-designer-reviewer", source: "designer-1", target: "reviewer-1", type: "default" },
      { id: "e-reviewer-evalcode", source: "reviewer-1", target: "eval-code-1", type: "default" },
      { id: "e-evalcode-tester", source: "eval-code-1", target: "tester-1", type: "pass" },
      { id: "e-evalcode-designer", source: "eval-code-1", target: "designer-1", type: "fail" },
      { id: "e-tester-evaltest", source: "tester-1", target: "eval-test-1", type: "default" },
      { id: "e-evaltest-output", source: "eval-test-1", target: "output-1", type: "pass" },
      { id: "e-evaltest-designer", source: "eval-test-1", target: "designer-1", type: "fail" },
    ],
  },
}

// ── Template 12: Twitter Growth Machine ───────────────────
// Pattern: input → trend-research → splitter → twitter-optimizer [parallel] → merger(select_best) → evaluator → output

const twitterGrowthMachine: WorkflowTemplate = {
  id: "twitter-growth-machine",
  name: "Twitter Growth Machine",
  description:
    "Research trending topics, generate multiple tweet angles, optimize each for algorithm, select the best, evaluate quality",
  category: "marketing",
  tags: ["twitter", "growth", "fan-out", "optimization"],
  workflow: {
    version: 1,
    name: "Twitter Growth Machine",
    description:
      "Research trending topics, generate multiple tweet angles, optimize each for algorithm, select the best, evaluate quality",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "researcher-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "product/Trend Researcher",
          prompt:
            "Research trending topics and conversations in this industry/niche. Find emerging themes, viral angles, and engagement patterns. Focus on what's resonating right now.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 600, y: 200 },
        config: {
          strategy:
            "Generate 5 distinct tweet/thread ideas based on the trending topics. Each should take a different angle: contrarian take, how-to, story, data insight, hot take.",
        },
      },
      {
        id: "optimizer-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "composio/twitter-algorithm-optimizer",
          prompt:
            "Optimize this tweet/thread for maximum reach using Twitter's algorithm. Improve hook, structure, engagement triggers, and formatting.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1200, y: 200 },
        config: {
          strategy: "select_best",
          prompt:
            "Pick the single best tweet/thread based on: viral potential, authenticity, engagement likelihood, and alignment with the author's niche.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1500, y: 200 },
        config: {
          criteria:
            "Score 1-10: hook strength (stops scrolling?), algorithm optimization (structure, length, formatting), authenticity (not generic AI slop), and engagement potential.",
          threshold: 8,
          maxRetries: 2,
          retryFrom: "researcher-1",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-researcher", source: "input-1", target: "researcher-1", type: "default" },
      { id: "e-researcher-splitter", source: "researcher-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-optimizer", source: "splitter-1", target: "optimizer-1", type: "default" },
      { id: "e-optimizer-merger", source: "optimizer-1", target: "merger-1", type: "default" },
      { id: "e-merger-evaluator", source: "merger-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-output", source: "evaluator-1", target: "output-1", type: "pass" },
      { id: "e-evaluator-researcher", source: "evaluator-1", target: "researcher-1", type: "fail" },
    ],
  },
}

// ── Template 13: Resume Tailoring Pipeline ────────────────
// Pattern: input → pdf-extract → resume-tailor → evaluator → docx → output

const resumeTailoringPipeline: WorkflowTemplate = {
  id: "resume-tailoring-pipeline",
  name: "Resume Tailoring Pipeline",
  description:
    "Extract resume from PDF, tailor for target job, evaluate ATS compatibility and impact, format as professional document",
  category: "general",
  tags: ["resume", "job", "documents", "quality-gate"],
  workflow: {
    version: 1,
    name: "Resume Tailoring Pipeline",
    description:
      "Extract resume from PDF, tailor for target job, evaluate ATS compatibility and impact, format as professional document",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "pdf-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "anthropic/pdf",
          prompt:
            "Extract the complete text content from this resume PDF. Preserve structure: contact info, summary, experience (with dates, roles, bullets), education, skills.",
        },
      },
      {
        id: "tailor-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "composio/tailored-resume-generator",
          prompt:
            "Tailor this resume for the target job posting. Rewrite bullets to highlight relevant experience, reorder sections for impact, add missing keywords, and optimize for ATS parsing.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 900, y: 200 },
        config: {
          criteria:
            "Score 1-10: keyword match with job description, ATS compatibility (parseable format, standard sections), impact of bullet points (quantified achievements), and honest representation (no fabrication).",
          threshold: 8,
          maxRetries: 3,
          retryFrom: "tailor-1",
        },
      },
      {
        id: "docx-1",
        type: "skill",
        position: { x: 1200, y: 200 },
        config: {
          skillRef: "anthropic/docx",
          prompt:
            "Format the tailored resume as a clean, professional .docx document. Use a modern but ATS-friendly layout with clear section headers.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1500, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-pdf", source: "input-1", target: "pdf-1", type: "default" },
      { id: "e-pdf-tailor", source: "pdf-1", target: "tailor-1", type: "default" },
      { id: "e-tailor-evaluator", source: "tailor-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-docx", source: "evaluator-1", target: "docx-1", type: "pass" },
      { id: "e-evaluator-tailor", source: "evaluator-1", target: "tailor-1", type: "fail" },
      { id: "e-docx-output", source: "docx-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 14: Full-Stack Code Audit ────────────────────
// Pattern: input → splitter → [security, quality, architecture, tests] parallel → merger → evaluator → pptx → output

const fullStackCodeAudit: WorkflowTemplate = {
  id: "full-stack-code-audit",
  name: "Full-Stack Code Audit",
  description:
    "Split codebase into audit areas, review security/quality/architecture/tests in parallel, synthesize findings, create audit report",
  category: "code",
  tags: ["audit", "security", "fan-out", "code-review"],
  workflow: {
    version: 1,
    name: "Full-Stack Code Audit",
    description:
      "Split codebase into audit areas, review security/quality/architecture/tests in parallel, synthesize findings, create audit report",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 30,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 300, y: 200 },
        config: {
          strategy:
            "Create 4 audit focus areas: Security (vulnerabilities, auth, input validation), Code Quality (patterns, naming, complexity), Architecture (structure, dependencies, scalability), Test Coverage (missing tests, quality of assertions).",
          maxBranches: 4,
        },
      },
      {
        id: "auditor-1",
        type: "skill",
        position: { x: 600, y: 200 },
        config: {
          skillRef: "dev/code-reviewer",
          prompt:
            "Perform a deep audit of this codebase focused on the assigned area. Find specific issues with file paths and line numbers. Rate severity (critical/high/medium/low). Provide fix recommendations.",
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 900, y: 200 },
        config: {
          strategy: "summarize",
          prompt:
            "Synthesize all audit findings into a comprehensive report. Organize by severity, include executive summary with overall health score, and prioritize remediation roadmap.",
        },
      },
      {
        id: "evaluator-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Score 1-10: finding specificity (exact file/line refs?), severity accuracy (proportional ratings?), remediation quality (actionable fixes?), and coverage breadth (all areas examined?).",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "splitter-1",
        },
      },
      {
        id: "pptx-1",
        type: "skill",
        position: { x: 1500, y: 200 },
        config: {
          skillRef: "anthropic/pptx",
          prompt:
            "Create an audit report presentation: overall health score slide, findings by category, top 10 critical issues, and remediation roadmap with estimated effort.",
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 1800, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-splitter", source: "input-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-auditor", source: "splitter-1", target: "auditor-1", type: "default" },
      { id: "e-auditor-merger", source: "auditor-1", target: "merger-1", type: "default" },
      { id: "e-merger-evaluator", source: "merger-1", target: "evaluator-1", type: "default" },
      { id: "e-evaluator-pptx", source: "evaluator-1", target: "pptx-1", type: "pass" },
      { id: "e-evaluator-splitter", source: "evaluator-1", target: "splitter-1", type: "fail" },
      { id: "e-pptx-output", source: "pptx-1", target: "output-1", type: "default" },
    ],
  },
}

// ── Template 15: Landing Page Generator (AJBTD) ──────────
// Pattern: input → architect → splitter(blocks) → [block-writer → evaluator(infostyle+slop)] per branch → merger(assembler QC) → evaluator(cross-block) → output
// Uses per-branch evaluator loops enabled by retryFrom remapping in expandSplitter

const landingPageGenerator: WorkflowTemplate = {
  id: "landing-page-generator",
  name: "Landing Page Generator",
  description:
    "Build landing page copy block-by-block with per-block quality loops. Each block is written, evaluated against infostyle + slop criteria, and rewritten until it passes. Assembled with cross-block QC.",
  category: "marketing",
  tags: ["landing", "copywriting", "fan-out", "quality-gate", "infostyle"],
  workflow: {
    version: 1,
    name: "Landing Page Generator",
    description:
      "Build landing page copy block-by-block with per-block quality loops, then assemble with cross-block QC",
    defaults: {
      model: "sonnet",
      maxTurns: 60,
      timeout_minutes: 45,
    },
    nodes: [
      {
        id: "input-1",
        type: "input",
        position: { x: 0, y: 200 },
        config: {},
      },
      {
        id: "architect-1",
        type: "skill",
        position: { x: 300, y: 200 },
        config: {
          skillRef: "ajbtd/landing-architect",
          prompt:
            "Build the information architecture for this landing page. Define 6-8 blocks in logical order: hero, situation, value_prop, mechanism, evidence, objections, pricing, faq. For each block specify: goal, key_message, data_sources from the input. Focus on information arc — facts first, no emotional manipulation. Validate logic coherence between blocks.",
        },
      },
      {
        id: "splitter-1",
        type: "splitter",
        position: { x: 600, y: 200 },
        config: {
          strategy:
            "Split the landing page skeleton into individual blocks. Each block becomes a self-contained writing task with its goal, key_message, data_sources, and position in the overall arc. Include the full skeleton context so each writer knows what comes before and after their block.",
          maxBranches: 8,
        },
      },
      {
        id: "block-writer-1",
        type: "skill",
        position: { x: 900, y: 200 },
        config: {
          skillRef: "ajbtd/landing-copywriter",
          prompt:
            "Write this landing page block following infostyle rules strictly:\n- Every sentence informs or helps decide (no padding)\n- Facts over emotion: no 'уникальный', 'инновационный', 'революционный'\n- Numbers with units and sources\n- No rhetorical questions, no 'Представь:', no intimate 2nd person\n- No emotion diagnosis ('anxiety исчезает'), no false empathy ('Мы понимаем')\n- Headlines = verb + measurable result\n- Third person by default\n- Each number appears in exactly ONE block across the whole landing\n\nOutput the block as structured JSON with block_id and elements array.",
        },
      },
      {
        id: "block-eval-1",
        type: "evaluator",
        position: { x: 1200, y: 200 },
        config: {
          criteria:
            "Evaluate this landing page block on two dimensions:\n\n**Infostyle (weight 60%):** Score 1-10. Every sentence must inform or help decide. Check: no buzzwords (уникальный, инновационный, революционный, трансформация, синергия), no rhetorical questions, no 'Представь:', no emotion diagnosis, no intimate 2nd person, no false empathy, no urgency manipulation, no vague authority. Headlines must be verb + measurable result. Numbers need units + sources. No padding sentences.\n\n**Slop detection (weight 40%):** Score 1-10 (10=clean, 1=pure slop). Check: no template-like AI phrasing ('в конечном итоге', 'стоит отметить', 'важно понимать', 'ключевой момент'), no generic filler, no fake authority, no weak causality ('because it matters'), no sales theater. Text should feel hand-written with specific details, not generated.\n\nFinal score = infostyle * 0.6 + slop * 0.4. Provide specific sentence-level flags with fix hints.",
          threshold: 8,
          maxRetries: 3,
          retryFrom: "block-writer-1",
          skillRefs: ["infostyle", "slop-check"],
        },
      },
      {
        id: "merger-1",
        type: "merger",
        position: { x: 1500, y: 200 },
        config: {
          strategy: "concatenate",
          prompt:
            "Assemble all blocks in skeleton order. Perform cross-block QC:\n- Number deduplication: each number appears in exactly ONE block\n- No question marks outside FAQ block\n- No emoji anywhere\n- Consistent terminology across blocks\n- Grounding: every claim traces to input data\n- Smooth transitions between blocks\n\nOutput the assembled landing page copy with block headers. Flag any cross-block issues found.",
        },
      },
      {
        id: "final-eval-1",
        type: "evaluator",
        position: { x: 1800, y: 200 },
        config: {
          criteria:
            "Evaluate the assembled landing page as a whole (infostyle + slop-check gate):\n\n1. **Information arc** (1-10): Does the page flow logically from problem → solution → proof → action? Does each block build on the previous?\n2. **Cross-block consistency** (1-10): Are numbers deduplicated? Is terminology consistent? Do transitions work?\n3. **Conversion clarity** (1-10): Is the path to action obvious? Is the CTA aligned with the value proposition?\n4. **Slop-free infostyle quality** (1-10): Factual, respectful, utility-first language with no manipulative fluff or AI filler patterns.\n\nFinal score = average of all 4. Treat probable_slop as fail and provide concrete rewrite instructions by block.",
          threshold: 7,
          maxRetries: 2,
          retryFrom: "architect-1",
          skillRefs: ["infostyle", "slop-check"],
        },
      },
      {
        id: "output-1",
        type: "output",
        position: { x: 2100, y: 200 },
        config: {},
      },
    ],
    edges: [
      { id: "e-input-architect", source: "input-1", target: "architect-1", type: "default" },
      { id: "e-architect-splitter", source: "architect-1", target: "splitter-1", type: "default" },
      { id: "e-splitter-writer", source: "splitter-1", target: "block-writer-1", type: "default" },
      { id: "e-writer-eval", source: "block-writer-1", target: "block-eval-1", type: "default" },
      { id: "e-eval-merger", source: "block-eval-1", target: "merger-1", type: "pass" },
      { id: "e-eval-writer", source: "block-eval-1", target: "block-writer-1", type: "fail" },
      { id: "e-merger-finaleval", source: "merger-1", target: "final-eval-1", type: "default" },
      { id: "e-finaleval-output", source: "final-eval-1", target: "output-1", type: "pass" },
      { id: "e-finaleval-architect", source: "final-eval-1", target: "architect-1", type: "fail" },
    ],
  },
}

// ── Public API ────────────────────────────────────────────

const builtinTemplates: WorkflowTemplate[] = [
  deepResearch,
  landingAuditLoop,
  segmentResearchGate,
  contentPipeline,
  leadResearchMachine,
  contentRepurposingFactory,
  predictableTextFactory,
  coldOutreachPipeline,
  competitorAdIntelligence,
  meetingActionsPlan,
  invoiceChaosFixer,
  designCodeTest,
  twitterGrowthMachine,
  resumeTailoringPipeline,
  fullStackCodeAudit,
  landingPageGenerator,
]

export function getBuiltinTemplates(): WorkflowTemplate[] {
  return builtinTemplates
}
