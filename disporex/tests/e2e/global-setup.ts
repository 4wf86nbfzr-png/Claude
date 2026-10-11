import { resetDatabase } from "../../src/server/db/reset";

export default async function globalSetup() {
  const url = process.env.DATABASE_TEST_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex_test";
  await resetDatabase(url);
}
