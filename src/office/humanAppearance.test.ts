import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ORDER } from './layout';
import { getHumanAppearance, HUMAN_APPEARANCE_BY_ID } from './humanAppearance';

test('every one of the 13 office agents has a complete human appearance profile', () => {
  assert.equal(Object.keys(HUMAN_APPEARANCE_BY_ID).length, 13);
  for (const id of AGENT_ORDER) {
    const profile = getHumanAppearance(id);
    assert.equal(profile.id, id);
    assert.match(profile.skinHex, /^#[0-9a-fA-F]{6}$/);
    assert.match(profile.hairHex, /^#[0-9a-fA-F]{6}$/);
    assert.match(profile.topHex, /^#[0-9a-fA-F]{6}$/);
    assert.match(profile.bottomHex, /^#[0-9a-fA-F]{6}$/);
    assert.match(profile.shoeHex, /^#[0-9a-fA-F]{6}$/);
    assert.ok(profile.heightScale >= 0.94 && profile.heightScale <= 1.06);
  }
});

test('all 13 agents have varied human hairstyles and natural warm skin tones', () => {
  const hairStyles = new Set(AGENT_ORDER.map((id) => getHumanAppearance(id).hairStyle));
  const skinTones = new Set(AGENT_ORDER.map((id) => getHumanAppearance(id).skinHex));
  const topStyles = new Set(AGENT_ORDER.map((id) => getHumanAppearance(id).topStyle));

  assert.ok(hairStyles.size >= 6, 'expected rich hairstyle diversity across the 13 humans');
  assert.ok(skinTones.size >= 6, 'expected natural skin tone variation across the 13 humans');
  assert.ok(topStyles.size >= 5, 'expected varied professional & studio outfits');

  // Verify specific role accessories match character professions
  assert.equal(getHumanAppearance('voice-artist').accessory, 'headset-mic');
  assert.equal(getHumanAppearance('video-editor').accessory, 'headset');
  assert.equal(getHumanAppearance('bible-researcher').accessory, 'glasses');
  assert.equal(getHumanAppearance('theological-guardian').accessory, 'tie-glasses');
});
