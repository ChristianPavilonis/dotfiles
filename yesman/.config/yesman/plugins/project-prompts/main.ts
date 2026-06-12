import { definePlugin, html, raw } from "@yesman/sdk";

const CHAT_PLUGIN = "project-chat";

type ProjectLink = {
  slug: string;
  name: string;
  description: string;
};

const PROJECTS: ProjectLink[] = [
  {
    slug: "rigzilla",
    name: "Rigzilla",
    description: "Rigzilla application repository.",
  },
  {
    slug: "trusted-server",
    name: "Trusted Server",
    description: "Trusted Server repository.",
  },
  {
    slug: "scrapezilla",
    name: "Scrapezilla",
    description: "Scrapezilla repository.",
  },
  {
    slug: "tauri-tutorials",
    name: "Tauri Tutorials",
    description: "Obsidian-tracked Tauri Tutorials project notes.",
  },
  {
    slug: "ideas",
    name: "Ideas",
    description: "Obsidian-tracked idea backlog and reference notes.",
  },
  {
    slug: "yesman",
    name: "YesMan",
    description: "Yesman daemon, plugin runtime, and UI repository.",
  },
];

export default definePlugin((plugin) => {
  plugin.page("/", {
    title: "Project Prompts",
    navTitle: "Project Prompts",
    render: async () => renderMovedPage(),
  });

  for (const project of PROJECTS) {
    plugin.page(`/${project.slug}`, {
      title: `${project.name} Chat`,
      navTitle: project.name,
      render: async () => renderMovedPage(project),
    });
  }
});

function renderMovedPage(project?: ProjectLink): string {
  const target = project ? chatHref(project.slug) : `/plugins/${CHAT_PLUGIN}`;
  const cards = PROJECTS.map((item) =>
    raw(html`
      <a
        class="ym-panel block p-4 transition hover:border-primary"
        href="${chatHref(item.slug)}"
        hx-get="${chatHref(item.slug)}"
        hx-target="#main"
        hx-push-url="true"
      >
        <div class="ym-eyebrow">Project</div>
        <div class="mt-2 font-semibold">${item.name}</div>
        <p class="mt-1 text-sm text-muted-foreground">${item.description}</p>
      </a>
    `)
  );

  return html`
    <section class="space-y-6">
      <header class="ym-page-header space-y-2">
        <p class="ym-eyebrow">Legacy route</p>
        <h1 class="ym-page-title">Project Chat</h1>
        <p class="max-w-3xl text-sm text-muted-foreground">
          Project Prompts has moved to durable chat threads with harness sessions, SSE replay,
          cancellation, and restart recovery.
        </p>
      </header>

      <div class="ym-panel p-5">
        <div class="ym-badge ym-badge-success">Moved</div>
        <h2 class="mt-3 text-xl font-bold tracking-wide">
          Project Prompts is now Project Chat
        </h2>
        <p class="mt-2 max-w-3xl text-sm text-muted-foreground">
          Use the host Project Chat navigation for ongoing project-aware Pi work.
        </p>
        <a
          class="ym-button ym-button-primary mt-5"
          href="${target}"
          hx-get="${target}"
          hx-target="#main"
          hx-push-url="true"
        >
          Open ${project ? project.name : "Project Chat"}
        </a>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${cards}
      </div>
    </section>
  `;
}

function chatHref(projectSlug: string): string {
  return `/plugins/${CHAT_PLUGIN}/${projectSlug}`;
}
