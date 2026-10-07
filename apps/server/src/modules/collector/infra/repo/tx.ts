import type { Db } from "../../../../core/db.js";

/** A database handle or an open transaction — repo functions accept either. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
