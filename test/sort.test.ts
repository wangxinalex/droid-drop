import test from "node:test";
import assert from "node:assert/strict";
import { sortEntries, type SortKey, type SortDirection } from "../src/sort";

test("sorts by name or modification time in either direction, with unknown dates last", () => {
  const entries = [
    { name: "Beta", modifiedAt: 100 },
    { name: "Alpha", modifiedAt: 300 },
    { name: "Gamma", modifiedAt: 200 },
  ];
  const names = (key: SortKey, direction: SortDirection) =>
    sortEntries(entries, key, direction).map((entry) => entry.name);
  assert.deepEqual(names("name", "asc"), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(names("name", "desc"), ["Gamma", "Beta", "Alpha"]);
  assert.deepEqual(names("modifiedAt", "desc"), ["Alpha", "Gamma", "Beta"]);
});

test("keeps folders ahead of files for every sort order, including missing dates", () => {
  const entries = [
    { name: "A file", isDirectory: false, modifiedAt: 300 },
    { name: "Z folder", isDirectory: true, modifiedAt: null },
    { name: "A folder", isDirectory: true, modifiedAt: 100 },
    { name: "Z file", isDirectory: false, modifiedAt: 200 },
  ];
  const names = (key: SortKey, direction: SortDirection) =>
    sortEntries(entries, key, direction).map((entry) => entry.name);
  assert.deepEqual(names("name", "asc"), [
    "A folder",
    "Z folder",
    "A file",
    "Z file",
  ]);
  assert.deepEqual(names("name", "desc"), [
    "Z folder",
    "A folder",
    "Z file",
    "A file",
  ]);
  assert.deepEqual(names("modifiedAt", "asc"), [
    "A folder",
    "Z folder",
    "Z file",
    "A file",
  ]);
  assert.deepEqual(names("modifiedAt", "desc"), [
    "A folder",
    "Z folder",
    "A file",
    "Z file",
  ]);
});
