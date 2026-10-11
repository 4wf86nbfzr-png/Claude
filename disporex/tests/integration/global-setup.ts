import { resetDatabase } from "../../src/server/db/reset";

/** Setzt die Testdatenbank vor jedem Testlauf vollständig zurück. */
export default async function setup() {
  Object.assign(process.env, { NODE_ENV: "test" });
  const url = process.env.DATABASE_TEST_URL ?? "postgres://disporex_owner:disporex@localhost:5432/disporex_test";
  await resetDatabase(url);
}
