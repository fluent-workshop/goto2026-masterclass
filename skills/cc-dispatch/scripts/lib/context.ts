#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Context assembly for CC dispatch briefs.
 * Gathers GitHub issue data and identifies relevant source files.
 */

import { $ } from "bun";

export interface IssueContext {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: { author: string; body: string; createdAt: string }[];
}

/** Fetch a GitHub issue with comments. */
export async function fetchIssue(repo: string, number: number): Promise<IssueContext> {
  const issueJson =
    await $`gh issue view ${number} --repo ${repo} --json title,body,labels,comments`.json();

  return {
    number,
    title: issueJson.title,
    body: issueJson.body ?? "",
    labels: issueJson.labels.map((l: { name: string }) => l.name),
    comments: issueJson.comments.map(
      (c: { author: { login: string }; body: string; createdAt: string }) => ({
        author: c.author.login,
        body: c.body,
        createdAt: c.createdAt,
      }),
    ),
  };
}

/** Identify relevant source files based on issue content and skill paths. */
export async function findRelevantFiles(
  issue: IssueContext,
  workspace: string,
  hints: string[] = [],
): Promise<string[]> {
  const files: string[] = [...hints];

  // Check if issue mentions specific skill directories
  const skillMatch = issue.body.match(/skills\/[\w-]+/g);
  if (skillMatch) {
    for (const path of skillMatch) {
      const absPath = `${workspace}/${path}`;
      try {
        await $`test -d ${absPath}`.quiet();
        files.push(path);
      } catch {
        // Directory doesn't exist, skip
      }
    }
  }

  // Check if issue mentions specific file paths
  const fileMatch = issue.body.match(/(?:scripts|lib|hooks)\/[\w./-]+/g);
  if (fileMatch) {
    for (const path of fileMatch) {
      const absPath = `${workspace}/${path}`;
      try {
        await $`test -e ${absPath}`.quiet();
        files.push(path);
      } catch {
        // File doesn't exist, skip
      }
    }
  }

  return [...new Set(files)]; // deduplicate
}
