/**
 * What you can buy.
 *
 * Shared by the server (which prices the PayFast order) and the billing screen
 * (which renders the cards), so the price a customer sees and the price we
 * charge come from one list. The server NEVER takes an amount from the browser
 * — it takes a `packId` and looks the amount up here.
 */

export interface TokenPack {
  id: string;
  name: string;
  /** Tokens credited on settlement. */
  tokens: number;
  /** Charge in ZAR cents. */
  amountCents: number;
  /** Whether buying this moves the organisation onto the Pro plan. */
  grantsPro: boolean;
  /** Term in days for the Pro plan. Ignored for pure top-ups. */
  termDays?: number;
  blurb: string;
  features: string[];
  highlight?: boolean;
}

export const TOKEN_PACKS: TokenPack[] = [
  {
    id: "pro-monthly",
    name: "Pro",
    tokens: 60_000,
    amountCents: 49_900,
    grantsPro: true,
    termDays: 30,
    blurb: "For teams running verifications every month.",
    // Thousands are grouped with a space to match en-ZA number formatting,
    // which is what every rendered figure elsewhere on this screen uses.
    features: [
      "60 000 tokens a month",
      "Unlimited scorecards and workbooks",
      "Whole-folder and per-pillar uploads",
      "Certificate registry auto-fill",
      "Priority document processing",
    ],
    highlight: true,
  },
  {
    id: "topup-25k",
    name: "25 000 tokens",
    tokens: 25_000,
    amountCents: 24_900,
    grantsPro: false,
    blurb: "A one-off top-up. Tokens never expire.",
    features: ["25 000 tokens", "Added to your balance immediately", "No change to your plan"],
  },
  {
    id: "topup-100k",
    name: "100 000 tokens",
    tokens: 100_000,
    amountCents: 89_900,
    grantsPro: false,
    blurb: "Best rate. For a full verification season.",
    features: ["100 000 tokens", "Roughly 10% better than the 25 000 pack", "Tokens never expire"],
  },
];

export function findTokenPack(packId: string): TokenPack | null {
  return TOKEN_PACKS.find((pack) => pack.id === packId) ?? null;
}
