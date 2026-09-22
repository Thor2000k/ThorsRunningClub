import { test, expect } from "@playwright/test";

test("bilingual calendar, registration, persistent attendance, and mobile layout", async ({
  page,
  request,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const nextMonday = new Date();
  nextMonday.setUTCDate(
    nextMonday.getUTCDate() + 7 - ((nextMonday.getUTCDay() + 6) % 7),
  );
  nextMonday.setUTCHours(16, 0, 0, 0);
  const imported = await request.post("/api/workouts/import", {
    headers: { Authorization: "Bearer local-e2e-import-token" },
    data: {
      workouts: [
        {
          external_id: "browser-test",
          title: "Monday together",
          kind: "Easy run",
          starts_at: nextMonday.toISOString(),
          distance_km: 6.5,
          duration_minutes: 40,
          pace: "Conversation pace",
          location: "Søerne, Copenhagen",
          notes: "Meet at the bridge.",
          translations: {
            da: {
              title: "Mandag sammen",
              notes: "Vi mødes på broen.",
              pace: "Snakketempo",
            },
          },
        },
      ],
    },
  });
  expect(imported.ok()).toBeTruthy();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "The week ahead" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Monday together" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Søerne, Copenhagen" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", /output=embed/);
  await expect(page.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "DA", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "da");
  await expect(
    page.getByRole("heading", { name: "Mandag sammen" }),
  ).toBeVisible();
  await expect(
    page.getByText("Vi mødes på broen.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Alle ture", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Intervaller", exact: true }).click();
  await expect(page.getByText("Lidt plads i kalenderen.")).toBeVisible();
  await page.getByRole("button", { name: "Alle ture", exact: true }).click();
  await page.getByRole("button", { name: "Tilmeld", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Dit navn").fill("Test Løber");
  await dialog
    .getByLabel("E-mailadresse")
    .fill(`browser-${Date.now()}@example.com`);
  await dialog
    .getByLabel("Adgangskode", { exact: true })
    .fill("A-test-password-123");
  await dialog
    .getByRole("button", { name: "Opret konto", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tilmeldt", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1 tilmeldte", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "da");
  await page.getByRole("button", { name: "Næste uge", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tilmeldt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Mine ture/ }).click();
  await expect(
    page.getByRole("heading", { name: "Mandag sammen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Monday together" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Monday together" }).click();
  await expect(
    dialog.getByRole("link", { name: /Open in Google Maps/ }),
  ).toHaveAttribute("href", /google.com\/maps\/search/);
  await dialog.getByRole("button", { name: "Leave this run" }).click();
  await expect(dialog.getByText("0 going")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Your week is wide open.")).toBeVisible();
  await page.getByRole("button", { name: "Showing my runs" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "DA", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Åbn eller luk menu" }).click();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Løbeordbog" }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Løbeordbog" })
    .click();
  await page.locator("summary").filter({ hasText: "Intervaller" }).click();
  await expect(
    page.getByText("Korte stræk med højere fart", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log ud" }).click();
  await expect(
    page.getByRole("button", { name: "Log ind", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/thors-mobile-da.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.screenshot({ path: "/tmp/thors-desktop-en.png", fullPage: true });
  expect(errors).toEqual([]);
});
