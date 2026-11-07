// DOM minimal pour les tests du fil, sans dépendance : analyse le HTML réduit de
// tests/fixtures/x/ et sait les seuls sélecteurs de selectors.ts, sous la forme
// `balise[attribut]`, `[attribut="valeur"]` et `[attribut$="fin"]`. Ces fixtures
// protègent la logique de Barrage, pas contre un changement du DOM de X.
import { readFileSync } from "node:fs";

type Test = { name: string; op: "" | "=" | "$="; value: string };

function parseSelector(selector: string): { tag: string | null; tests: Test[] } {
  const match = /^([a-z]+)?((?:\[[^\]]+\])*)$/.exec(selector);
  if (!match) throw new Error(`Sélecteur non pris en charge : ${selector}`);
  const tests = [...(match[2] ?? "").matchAll(/\[([\w-]+)(?:(\$?=)"([^"]*)")?\]/g)].map(
    ([, name, op, value]) => ({ name, op: op ?? "", value: value ?? "" }) as Test,
  );
  return { tag: match[1] ?? null, tests };
}

export class FakeNode {
  parent: FakeElement | null = null;
  children: FakeNode[] = [];

  get isConnected(): boolean {
    return this.parent ? this.parent.isConnected : this instanceof FakeRoot;
  }
  get textContent(): string {
    return this.children.map((child) => child.textContent).join("");
  }
  /** Descendants, dans l'ordre du document. */
  *elements(): Generator<FakeElement> {
    for (const child of this.children) {
      if (child instanceof FakeElement) {
        yield child;
        yield* child.elements();
      }
    }
  }
  querySelectorAll(selector: string): FakeElement[] {
    return [...this.elements()].filter((el) => el.matches(selector));
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class FakeText extends FakeNode {
  private readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  override get textContent(): string {
    return this.text;
  }
}

export class FakeElement extends FakeNode {
  readonly tag: string;
  readonly attributes: Map<string, string>;
  constructor(tag: string, attributes: Map<string, string>) {
    super();
    this.tag = tag;
    this.attributes = attributes;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  toggleAttribute(name: string, force: boolean): void {
    if (force) this.attributes.set(name, "");
    else this.attributes.delete(name);
  }
  matches(selector: string): boolean {
    const { tag, tests } = parseSelector(selector);
    if (tag && tag !== this.tag) return false;
    return tests.every(({ name, op, value }) => {
      const actual = this.attributes.get(name);
      if (actual === undefined) return false;
      return op === "" || (op === "=" ? actual === value : actual.endsWith(value));
    });
  }
  closest(selector: string): FakeElement | null {
    for (let el: FakeElement | null = this; el; el = el.parent) if (el.matches(selector)) return el;
    return null;
  }
}

class FakeRoot extends FakeElement {
  constructor() {
    super("html", new Map());
  }
}

const TAG_RE = /<(\/?)([a-z][a-z0-9]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>|([^<]+)/g;

function parse(html: string): FakeRoot {
  const root = new FakeRoot();
  let current: FakeElement = root;
  for (const [, closing, tag, attrs, text] of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(TAG_RE)) {
    if (text !== undefined) {
      if (!text.trim()) continue;
      const node = new FakeText(text.trim());
      node.parent = current;
      current.children.push(node);
    } else if (closing) current = current.parent ?? root;
    else {
      const attributes = new Map([...(attrs ?? "").matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [k as string, v ?? ""]));
      const element = new FakeElement(tag as string, attributes);
      element.parent = current;
      current.children.push(element);
      current = element;
    }
  }
  return root;
}

export const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/x/${name}.html`, import.meta.url), "utf8");

/**
 * Remplace le document par ce HTML, en gardant ses cookies. `requestAnimationFrame`
 * s'exécute aussitôt, et `MutationObserver` ne fait rien : le premier passage
 * suffit aux tests.
 */
export function installDom(html: string): FakeRoot {
  const root = parse(html);
  const previous = (globalThis as any).document;
  const document = Object.defineProperties(
    { documentElement: root, querySelector: (s: string) => root.querySelector(s), querySelectorAll: (s: string) => root.querySelectorAll(s) },
    { cookie: { get: () => previous.cookie } },
  );
  Object.assign(globalThis, {
    document,
    Element: FakeElement,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    requestAnimationFrame: (task: () => void) => queueMicrotask(task),
  });
  return root;
}
