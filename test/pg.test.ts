import { pipe } from "@effect/data/Function";
import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { it, describe, expect } from "./helpers";
import { cities } from "./pg.schema";
import {
  connect,
  db,
  runQuery,
  runQueryExactlyOne,
  runQueryOne,
  runRawQuery,
  transaction,
} from "effect-drizzle/pg";
import { PgError, NotFound, TooMany } from "effect-drizzle/errors";

describe("pg", () => {
  it.pgtransaction("runQuery ==0", () =>
    Effect.gen(function* ($) {
      const query = runQuery(db.select().from(cities));
      expect((yield* $(query)).length).toEqual(0);

      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));
      yield* $(runQuery(db.insert(cities).values({ name: "Bar" })));

      expect((yield* $(query)).length).toEqual(2);
    })
  );

  it.pgtransaction("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));
      yield* $(runQuery(db.insert(cities).values({ name: "Bar" })));

      const query = runQuery(db.select().from(cities));
      expect((yield* $(query)).length).toEqual(2);
    })
  );

  it.pgtransaction("runQueryOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        db.select().from(cities),
        runQueryOne,
        Effect.either
      );

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select "id", "name" from "cities"',
            params: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(db.insert(cities).values({ name: "Foo" }), runQuery);

      const res2 = yield* $(
        pipe(
          db.select({ name: cities.name }).from(cities),
          runQueryOne,
          Effect.either
        )
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(db.insert(cities).values({ name: "Foo" }), runQuery);
      yield* $(db.insert(cities).values({ name: "Bar" }), runQuery);

      const res2 = yield* $(
        db.select({ name: cities.name }).from(cities),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        pipe(db.select().from(cities), runQueryExactlyOne, Effect.either)
      );

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select "id", "name" from "cities"',
            params: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryExactlyOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));

      const res2 = yield* $(
        db.select({ name: cities.name }).from(cities),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));
      yield* $(runQuery(db.insert(cities).values({ name: "Bar" })));

      const res2 = yield* $(
        db.select({ name: cities.name }).from(cities),
        runQueryExactlyOne,
        Effect.either
      );

      expect(res2).toEqual(
        E.left(
          new TooMany({
            sql: 'select "name" from "cities"',
            params: [],
          })
        )
      );
    })
  );

  it.pgtransaction("handles errors", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        "select * from dontexist;",
        runRawQuery,
        Effect.either
      );

      expect(res).toEqual(
        E.left(
          new PgError({
            code: "42P01",
            message: `relation "dontexist" does not exist`,
          })
        )
      );
    })
  );

  it.pgtransaction("transactions", () =>
    Effect.gen(function* ($) {
      const count = pipe(
        db.select().from(cities),
        runQuery,
        Effect.map((_) => _.length)
      );

      const insert = pipe(db.insert(cities).values({ name: "foo" }), runQuery);

      yield* $(insert, transaction);
      expect(yield* $(count)).toEqual(1);

      yield* $(insert, transaction);
      expect(yield* $(count)).toEqual(2);

      yield* $(
        Effect.all(insert, Effect.fail("fail")),
        transaction,
        Effect.either
      );

      expect(yield* $(count)).toEqual(2);
    })
  );

  it.effect("create database", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        connect(
          Effect.all(
            runRawQuery(`drop database if exists "foo"`),
            runRawQuery(`create database "foo";`),
            runRawQuery(`drop database "foo"`)
          )
        ),
        Effect.zipRight(Effect.succeed("ok")),
        Effect.either
      );

      expect(res).toEqual(E.right("ok"));
    })
  );
});
