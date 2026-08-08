import {
  conversationTitle,
  parsePullRequest,
  parseSettings,
  reviewRequestId,
} from "./main.ts";

Deno.test("settings remain inert until explicitly enabled and configured", () => {
  const settings = parseSettings({});
  if (settings.enabled || settings.repositories.length !== 0) {
    throw new Error("default settings must not create reviews");
  }

  const configured = parseSettings({
    enabled: true,
    poll_interval_seconds: 60,
    max_prs_per_poll: 2,
    repositories: [{
      name: "example",
      repo: "owner/repository",
      cwd: "/tmp/repository",
      workspace_id: "0190c7d4-5f4c-7cc6-9f35-000000000002",
    }],
  });
  if (
    !configured.enabled || configured.repositories[0]?.workspaceId === undefined
  ) {
    throw new Error("valid repository configuration was not retained");
  }
});

Deno.test("PR parsing rejects incomplete GitHub CLI objects", () => {
  if (parsePullRequest({ number: 12 }) !== null) {
    throw new Error("incomplete PR must be rejected");
  }
  if (
    parsePullRequest({
      number: 12,
      title: "Review me",
      url: "https://github.com/owner/repository/pull/12",
      headRefOid: "a".repeat(40),
      headRefName: "feature",
      baseRefName: "main",
      isDraft: false,
    }) === null
  ) {
    throw new Error("valid PR must parse");
  }
});

Deno.test("conversation titles stay within the protocol schema bound", () => {
  const title = conversationTitle(
    {
      name: "example",
      repo: "o".repeat(300),
      cwd: "/tmp/repository",
      workspaceId: "0190c7d4-5f4c-7cc6-9f35-000000000002",
      enabled: true,
    },
    {
      number: 12,
      title: "Review me",
      url: "https://github.com/owner/repository/pull/12",
      headRefOid: "a".repeat(40),
      headRefName: "feature",
      baseRefName: "main",
      isDraft: false,
    },
  );
  if (Array.from(title).length > 128) {
    throw new Error("title exceeds protocol schema bound");
  }
});

Deno.test("host request IDs are stable and bounded by the PR head", async () => {
  const repository = {
    name: "example",
    repo: "owner/repository",
    cwd: "/tmp/repository",
    workspaceId: "0190c7d4-5f4c-7cc6-9f35-000000000002",
    enabled: true,
  };
  const pullRequest = {
    number: 12,
    title: "Review me",
    url: "https://github.com/owner/repository/pull/12",
    headRefOid: "a".repeat(40),
    headRefName: "feature",
    baseRefName: "main",
    isDraft: false,
  };
  const first = await reviewRequestId(repository, pullRequest);
  const second = await reviewRequestId(repository, pullRequest);
  if (
    first !== second || first.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(first)
  ) {
    throw new Error(
      "request ID is not a valid stable JSON-RPC idempotency identity",
    );
  }
});
