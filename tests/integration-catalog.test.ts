import { describe, expect, it } from "vitest";
import { PROVIDER_KEYS } from "@/lib/v1/domain";
import {
  INTEGRATION_CATEGORY_KEYS,
  integrationCatalog,
  isIntegrationCategory,
  providerPrimaryCategory,
} from "@/lib/v1/integration-catalog";

describe("integration catalog", () => {
  it("organizes the catalog around clear marketer-facing categories", () => {
    expect(INTEGRATION_CATEGORY_KEYS).toEqual([
      "data",
      "advertising",
      "messaging",
      "social",
    ]);
    for (const category of INTEGRATION_CATEGORY_KEYS) {
      expect(
        integrationCatalog.some((entry) => entry.category === category),
      ).toBe(true);
      expect(isIntegrationCategory(category)).toBe(true);
    }
  });

  it("keeps every implemented provider reachable from the catalog", () => {
    for (const provider of PROVIDER_KEYS) {
      expect(
        integrationCatalog.some((entry) => entry.provider === provider),
      ).toBe(true);
      expect(providerPrimaryCategory[provider]).toBeDefined();
    }
  });

  it("never presents roadmap entries as implemented connectors", () => {
    for (const entry of integrationCatalog.filter(
      (candidate) => candidate.availability === "planned",
    )) {
      expect(entry.provider).toBeUndefined();
      expect(entry.nativeHref).toBeUndefined();
      expect(entry.note).toBeTruthy();
    }
  });

  it("uses stable unique catalog identifiers", () => {
    const ids = integrationCatalog.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

