import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarUrl, initials, readProfile, storedProfile } from "../src/features/profiles/profile.ts";

const AVATAR = "https://pbs.twimg.com/profile_images/1234567890/AbCd_normal.jpg";

/** Compte tel que X le renvoie après un blocage, champs utiles seulement. */
const user = (extra: Record<string, unknown> = {}) => ({
  screen_name: "JeanDupont",
  name: "Jean Dupont",
  description: "Élu local. Mon site : https://t.co/abc &amp; plus",
  entities: { description: { urls: [{ url: "https://t.co/abc", display_url: "exemple.fr/jean", expanded_url: "https://exemple.fr/jean" }] } },
  profile_image_url_https: AVATAR,
  default_profile_image: false,
  followers_count: 12_459,
  verified: false,
  is_blue_verified: true,
  ...extra,
});

test("le profil renvoyé par X donne nom, identifiant, avatar et bio lisible", () => {
  assert.deepEqual(readProfile(user(), "jeandupont"), {
    name: "Jean Dupont",
    screenName: "JeanDupont",
    avatar: AVATAR,
    bio: "Élu local. Mon site : exemple.fr/jean & plus",
    followers: 12_459,
    verified: true,
  });
});

test("certifié par l'un ou l'autre badge de X, abonnés illisibles laissés de côté", () => {
  assert.equal(readProfile(user({ is_blue_verified: false }), "jeandupont")?.verified, false);
  assert.equal(readProfile(user({ is_blue_verified: false, verified: true }), "jeandupont")?.verified, true);
  assert.equal(readProfile(user({ is_blue_verified: "oui" }), "jeandupont")?.verified, false);
  // Nom du champ sur l'API 1.1, celle du blocage.
  assert.equal(readProfile(user({ is_blue_verified: undefined, ext_is_blue_verified: true }), "jeandupont")?.verified, true);
  assert.equal(readProfile(user({ is_blue_verified: undefined, ext_is_blue_verified: false }), "jeandupont")?.verified, false);
  for (const followers_count of [undefined, -1, 1.5, "12", Number.MAX_VALUE]) {
    assert.equal(readProfile(user({ followers_count }), "jeandupont")?.followers, null);
  }
  assert.equal(readProfile(user({ followers_count: 0 }), "jeandupont")?.followers, 0);
});

test("les initiales viennent des deux premiers mots du nom, sinon de l'identifiant", () => {
  assert.equal(initials({ name: "Compte Exemple", screenName: "x" }), "CE");
  assert.equal(initials({ name: "élise de la Tour", screenName: "x" }), "ÉD");
  assert.equal(initials({ name: "🇫🇷 Jean", screenName: "x" }), "J");
  assert.equal(initials({ name: "🇫🇷 ✊", screenName: "_jean" }), "J");
  assert.equal(initials({ name: "", screenName: "___" }), "?");
});

test("un profil qui n'est pas celui du compte visé est ignoré", () => {
  assert.equal(readProfile(user(), "autre"), null);
  assert.equal(readProfile({}, "jeandupont"), null);
  assert.equal(readProfile(null, "jeandupont"), null);
  assert.equal(readProfile([user()], "jeandupont"), null);
});

test("l'avatar par défaut, ou venu d'ailleurs que X, n'est pas gardé", () => {
  assert.equal(readProfile(user({ default_profile_image: true }), "jeandupont")?.avatar, null);
  const silhouette = "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png";
  assert.equal(readProfile(user({ profile_image_url_https: silhouette }), "jeandupont")?.avatar, null);
  assert.equal(readProfile(user({ profile_image_url_https: "https://pirate.example/a.jpg" }), "jeandupont")?.avatar, null);
  assert.equal(readProfile(user({ profile_image_url_https: "http://pbs.twimg.com/a.jpg" }), "jeandupont")?.avatar, null);
});

test("sans nom ni bio, l'identifiant tient lieu de nom et la bio reste vide", () => {
  const profile = readProfile(user({ name: "  ", description: undefined, entities: undefined }), "jeandupont");
  assert.equal(profile?.name, "JeanDupont");
  assert.equal(profile?.bio, "");
});

test("l'avatar se décline dans les tailles de X", () => {
  assert.equal(avatarUrl(AVATAR, "200x200"), "https://pbs.twimg.com/profile_images/1234567890/AbCd_200x200.jpg");
  assert.equal(avatarUrl(AVATAR, "bigger"), "https://pbs.twimg.com/profile_images/1234567890/AbCd_bigger.jpg");
  assert.equal(
    avatarUrl("https://pbs.twimg.com/profile_images/1/sans_extension_normal", "400x400"),
    "https://pbs.twimg.com/profile_images/1/sans_extension_400x400",
  );
});

test("un « $ » dans une adresse de la bio est gardé tel quel", () => {
  const urls = [{ url: "https://t.co/abc", display_url: "site.fr/$'x$&" }];
  const profile = readProfile(user({ entities: { description: { urls } } }), "jeandupont");
  assert.equal(profile?.bio, "Élu local. Mon site : site.fr/$'x$& & plus");
});

test("un lien court qui en commence un autre ne l'abîme pas, et une adresse posée n'est pas relue", () => {
  const urls = [
    { url: "https://t.co/abc", display_url: "un.fr" },
    { url: "https://t.co/abcd", display_url: "deux.fr/https://t.co/abc" },
  ];
  const description = "https://t.co/abcd et https://t.co/abc, puis https://t.co/abcz.";
  const profile = readProfile(user({ description, entities: { description: { urls } } }), "jeandupont");
  assert.equal(profile?.bio, "deux.fr/https://t.co/abc et un.fr, puis https://t.co/abcz.");
});

test("seule la bio est décodée, pas les adresses qui y entrent", () => {
  const urls = [{ url: "https://t.co/abc", display_url: "ex.fr/?q=&lt;b" }];
  const profile = readProfile(user({ entities: { description: { urls } } }), "jeandupont");
  assert.equal(profile?.bio, "Élu local. Mon site : ex.fr/?q=&lt;b & plus");
});

test("un profil stocké sans abonnés ni certification reste lisible", () => {
  assert.deepEqual(storedProfile({ name: "A", screenName: "A", avatar: null, bio: "" }), {
    name: "A",
    screenName: "A",
    avatar: null,
    bio: "",
    followers: null,
    verified: false,
  });
});

test("un profil stocké mal formé est ignoré, un avatar suspect ou par défaut retiré", () => {
  const profile = readProfile(user(), "jeandupont");
  assert.deepEqual(storedProfile(profile), profile);
  assert.equal(storedProfile({ name: "x" }), null);
  assert.equal(storedProfile("x"), null);
  assert.equal(storedProfile({ ...profile, avatar: "javascript:alert(1)" })?.avatar, null);
  const silhouette = "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png";
  assert.equal(storedProfile({ ...profile, avatar: silhouette })?.avatar, null);
});
