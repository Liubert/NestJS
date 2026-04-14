import { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_PROMPT = `Context need — reason about translation ambiguity:

For each key, mentally try to translate the text. Ask yourself: could this word or phrase produce translations with meaningfully different meanings depending on what it refers to in the product?

- "required": yes — the text can map to multiple distinct real-world concepts, and picking the wrong one would produce an incorrect translation. List 2–3 things it could mean in "contextReason".
- "useful": the dominant meaning is clear, but knowing the UI location or tone would increase confidence. Explain what would help in "contextReason".
- "none": only one reasonable interpretation exists regardless of context.

Reasoning examples:
- "Home" → could mean a homepage, a home address, or a device home screen → required; contextReason: "Could mean: app homepage, user's home address, or home screen button"
- "Delete account" → clearly means removing the user account → none (or useful if tone matters)
- "Book" → could mean to reserve/schedule something, or a physical/digital book to read → required; contextReason: "Could mean: to book/reserve, or a book as content"`;

export class UpdateContextDetectionPrompt17761000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE ai_config SET context_detection_prompt = $1`,
      [NEW_PROMPT],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE ai_config SET context_detection_prompt = $1`,
      [
        `Context need — strict rules:

RULE 1 (short labels): If the text is 1–3 words AND has ANY alternate meaning in a software product → ALWAYS "required". No exceptions. Do not apply "dominant meaning" reasoning.
RULE 2 (longer phrases): If 4+ words give ~85% confidence in meaning but UI location would confirm → "useful".
RULE 3: "none" only when meaning is 100% unambiguous in every possible software context.

Single words and short prepositions are almost always "required": "By", "Log", "Draft", "Train", "Light", "Save", "Open", "Run", "Post", "File", "Issue", "Match", "Charge", "Record", "Close", "Set", "Tag"
Longer phrases can be "useful": "Delete account", "Approve request", "Reset password"
Clear phrases are "none": "Email address", "Password", "Sign in", "Cancel", "Loading..."

When contextNeed is "required" or "useful", provide "contextReason" — one sentence (max 30 words) explaining the alternate meanings.`,
      ],
    );
  }
}
