import { lazy, Suspense, useEffect, useState } from "react";

const PageBuilderDemo = lazy(() =>
    import("./page-builder-demo").then((module) => ({
        default: module.PageBuilderDemo,
    })),
);
const TextEditorDemo = lazy(() =>
    import("./text-editor-demo").then((module) => ({
        default: module.TextEditorDemo,
    })),
);

type Demo = "page-builder" | "text-editor";
type Pane = "builder" | "published";

interface Route {
    demo: Demo;
    pane: Pane;
}

function parseSearch(search: string): Route {
    const params = new URLSearchParams(search);
    const demo =
        params.get("demo") === "text-editor" ? "text-editor" : "page-builder";
    const pane = params.get("view") === "published" ? "published" : "builder";
    return { demo, pane };
}

function toUrl(route: Route): string {
    if (route.demo === "text-editor") return "/?demo=text-editor";
    if (route.pane === "published") {
        return "/?demo=page-builder&view=published";
    }
    return "/";
}

export function App() {
    const [route, setRoute] = useState<Route>(() =>
        parseSearch(window.location.search),
    );

    useEffect(() => {
        const onPop = () => setRoute(parseSearch(window.location.search));
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    function go(next: Route) {
        const url = toUrl(next);
        const current = `${window.location.pathname}${window.location.search}`;
        if (current !== url) {
            window.history.pushState(next, "", url);
        }
        setRoute(next);
    }

    return (
        <div className="shell">
            <header className="masthead">
                <div className="masthead__brand">
                    <span className="masthead__mark" aria-hidden>
                        F
                    </span>
                    <div>
                        <p className="masthead__title">FrontLit</p>
                        <p className="masthead__sub">
                            Published React packages, running in Vite
                        </p>
                    </div>
                </div>
                <nav className="tabs" aria-label="Package demos">
                    <button
                        type="button"
                        className={
                            route.demo === "page-builder" ? "is-active" : ""
                        }
                        onClick={() =>
                            go({
                                demo: "page-builder",
                                pane:
                                    route.demo === "page-builder"
                                        ? route.pane
                                        : "builder",
                            })
                        }
                    >
                        Page builder
                    </button>
                    <button
                        type="button"
                        className={
                            route.demo === "text-editor" ? "is-active" : ""
                        }
                        onClick={() =>
                            go({ demo: "text-editor", pane: "builder" })
                        }
                    >
                        Text editor
                    </button>
                </nav>
            </header>

            {route.demo === "page-builder" ? (
                <div className="toolbar">
                    <p className="toolbar__copy">
                        <code>@frontlit/page-builder</code> — edit a landing
                        page, then open the published renderer fed by{" "}
                        <code>onChange</code>.
                    </p>
                    <nav className="pills" aria-label="Page builder views">
                        <button
                            type="button"
                            className={
                                route.pane === "builder" ? "is-active" : ""
                            }
                            onClick={() =>
                                go({ demo: "page-builder", pane: "builder" })
                            }
                        >
                            Builder
                        </button>
                        <button
                            type="button"
                            className={
                                route.pane === "published" ? "is-active" : ""
                            }
                            onClick={() =>
                                go({ demo: "page-builder", pane: "published" })
                            }
                        >
                            Published
                        </button>
                    </nav>
                </div>
            ) : (
                <div className="toolbar">
                    <p className="toolbar__copy">
                        <code>@frontlit/text-editor</code> — TipTap editor and
                        static renderer sharing one document.
                    </p>
                </div>
            )}

            <main className="canvas">
                <Suspense fallback={<p className="toolbar__copy">Loading…</p>}>
                    {route.demo === "page-builder" ? (
                        <PageBuilderDemo pane={route.pane} />
                    ) : (
                        <TextEditorDemo />
                    )}
                </Suspense>
            </main>
        </div>
    );
}
