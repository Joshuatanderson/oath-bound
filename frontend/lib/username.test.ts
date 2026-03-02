import { describe, test, expect } from "bun:test";
import { validateUsername, USERNAME_RE } from "./username";

describe("validateUsername", () => {
  test("accepts valid lowercase usernames", () => {
    expect(validateUsername("josh")).toBe("josh");
    expect(validateUsername("my-skill-dev")).toBe("my-skill-dev");
    expect(validateUsername("abc123")).toBe("abc123");
    expect(validateUsername("a-b")).toBe("a-b");
  });

  test("lowercases input before validating", () => {
    expect(validateUsername("Josh")).toBe("josh");
    expect(validateUsername("MY-USER")).toBe("my-user");
    expect(validateUsername("  Josh  ")).toBe("josh");
  });

  test("rejects too-short usernames", () => {
    expect(validateUsername("ab")).toBeNull();
    expect(validateUsername("a")).toBeNull();
    expect(validateUsername("")).toBeNull();
  });

  test("rejects usernames starting with a number or hyphen", () => {
    expect(validateUsername("1abc")).toBeNull();
    expect(validateUsername("-abc")).toBeNull();
  });

  test("rejects usernames with invalid characters", () => {
    expect(validateUsername("my_user")).toBeNull();
    expect(validateUsername("my.user")).toBeNull();
    expect(validateUsername("my user")).toBeNull();
    expect(validateUsername("my@user")).toBeNull();
  });

  test("regex rejects uppercase directly", () => {
    expect(USERNAME_RE.test("Josh")).toBe(false);
    expect(USERNAME_RE.test("ALLCAPS")).toBe(false);
  });
});
