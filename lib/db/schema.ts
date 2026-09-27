import { relations } from "drizzle-orm";
import { integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  alias: text("alias").notNull().default(""),
  passwordHash: text("password_hash"),
}, (table) => ({ emailUnique: uniqueIndex("users_email_unique").on(table.email) }));

export const accounts = pgTable("accounts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => ({ compoundKey: primaryKey({ columns: [table.provider, table.providerAccountId] }) }));

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verificationTokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (table) => ({ compoundKey: primaryKey({ columns: [table.identifier, table.token] }) }));

export const workouts = pgTable("workouts", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  distanceKm: numeric("distance_km", { precision: 7, scale: 2 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  pace: text("pace").notNull(),
  location: text("location").notNull(),
  notes: text("notes").notNull().default(""),
  translations: jsonb("translations").$type<Record<string, Record<string, string>>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => ({ externalIdUnique: uniqueIndex("workouts_external_id_unique").on(table.externalId) }));

export const attendance = pgTable("attendance", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (table) => ({ compoundKey: primaryKey({ columns: [table.userId, table.workoutId] }) }));

export const comments = pgTable("workout_comments", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const userRelations = relations(users, ({ many }) => ({ attendance: many(attendance) }));
export const workoutRelations = relations(workouts, ({ many }) => ({ attendance: many(attendance) }));
export const attendanceRelations = relations(attendance, ({ one }) => ({
  user: one(users, { fields: [attendance.userId], references: [users.id] }),
  workout: one(workouts, { fields: [attendance.workoutId], references: [workouts.id] }),
}));
export const commentRelations = relations(comments, ({ one }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  workout: one(workouts, { fields: [comments.workoutId], references: [workouts.id] }),
}));
