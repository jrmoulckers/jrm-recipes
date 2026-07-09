/**
 * First-run onboarding copy (issue #147). Centralized so the welcome moment can
 * be localized or mode-adapted later without hunting through JSX. Voice follows
 * `docs/voice-and-tone.md`: warm, familial, encouraging, and oriented around the
 * core loop — create → cook → share.
 */

export interface OnboardingStep {
  /** Short imperative title for the step. */
  title: string;
  /** One warm line of guidance. */
  body: string;
}

export interface WelcomeCopy {
  heading: string;
  subheading: string;
  steps: [OnboardingStep, OnboardingStep, OnboardingStep];
  /** Primary CTA on step one. */
  cta: string;
  /** Dismiss affordance. */
  dismiss: string;
}

export const WELCOME_COPY: WelcomeCopy = {
  heading: "Welcome to Heirloom 👋",
  subheading: "Three little steps to keep your family's recipes alive.",
  steps: [
    {
      title: "Add a recipe",
      body: "Start with the dish everyone asks you to make.",
    },
    {
      title: "Cook it hands-free",
      body: "Open Cook Mode for timers and step-by-step.",
    },
    {
      title: "Share with family",
      body: "Invite your people to a group cookbook.",
    },
  ],
  cta: "Create your first recipe",
  dismiss: "Maybe later",
};

/** A single onboarding-checklist step: copy plus its call-to-action label. */
export interface ChecklistStep extends OnboardingStep {
  /** Label for the step's action button. */
  cta: string;
}

export interface ChecklistCopy {
  heading: string;
  subheading: string;
  /** Shown in place of the subheading once every step is complete. */
  allDone: string;
  steps: [ChecklistStep, ChecklistStep, ChecklistStep];
  dismiss: string;
}

/**
 * Copy for the data-driven first-run checklist (#78). Distinct from
 * `WELCOME_COPY`: this one tracks *real* progress through create → cook → share
 * and lives on the home dashboard, so each step also carries an action label.
 * Order matches the `OnboardingProgress` flags the component maps onto.
 */
export const ONBOARDING_CHECKLIST_COPY: ChecklistCopy = {
  heading: "Getting started",
  subheading: "A few steps to bring your family's cooking to life.",
  allDone: "You're all set — happy cooking! 🎉",
  steps: [
    {
      title: "Add your first recipe",
      body: "Write down a dish you make from memory.",
      cta: "New recipe",
    },
    {
      title: "Cook it hands-free",
      body: "Open Cook Mode for timers and step-by-step.",
      cta: "Browse recipes",
    },
    {
      title: "Share with your family",
      body: "Start a group cookbook and invite your people.",
      cta: "Create a group",
    },
  ],
  dismiss: "Dismiss",
};
