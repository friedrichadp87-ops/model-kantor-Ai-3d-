import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aspectStringToRatio,
  computeScreenFitScale,
  createStudioActivityEntry,
  parseImageDataUrl,
  validateImageRequest,
  validateVideoRequest,
} from './mediaStudio';

test('validateVideoRequest enforces prompt length and strict 16:9 or 9:16 aspect ratio', () => {
  const emptyRes = validateVideoRequest({ prompt: 'hi', aspectRatio: '16:9', duration: '10s' });
  assert.equal(emptyRes.ok, false);

  const badAspect = validateVideoRequest({
    prompt: 'Tur sinematik studio arsitektur modern',
    aspectRatio: '4:3',
    duration: '10s',
  });
  assert.equal(badAspect.ok, false);

  const landscape = validateVideoRequest({
    prompt: 'Tur sinematik studio arsitektur modern',
    aspectRatio: '16:9',
    duration: '5s',
  });
  assert.equal(landscape.ok, true);
  assert.equal(landscape.value?.aspectRatio, '16:9');
  assert.equal(landscape.value?.duration, '5s');

  const portrait = validateVideoRequest({
    prompt: 'Presentasi vertikal produk AI',
    aspectRatio: '9:16',
    duration: '10s',
  });
  assert.equal(portrait.ok, true);
  assert.equal(portrait.value?.aspectRatio, '9:16');
});

test('validateImageRequest handles create and edit modes with strict source validation', () => {
  const createValid = validateImageRequest({
    mode: 'create',
    prompt: 'Poster minimalis arsitektur studio AI',
    aspectRatio: '16:9',
    imageSize: '1K',
  });
  assert.equal(createValid.ok, true);
  assert.equal(createValid.value?.mode, 'create');
  assert.equal(createValid.value?.aspectRatio, '16:9');

  const editMissingSource = validateImageRequest({
    mode: 'edit',
    prompt: 'Ubah pencahayaan menjadi senja hangat',
    aspectRatio: '1:1',
    imageSize: '1K',
  });
  assert.equal(editMissingSource.ok, false);

  const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA';
  const editValid = validateImageRequest({
    mode: 'edit',
    prompt: 'Tambahkan tanaman monstera di sudut ruangan',
    aspectRatio: '4:3',
    imageSize: '2K',
    sourceImageDataUrl: samplePng,
  });
  assert.equal(editValid.ok, true);
  assert.equal(editValid.value?.sourceImage?.mimeType, 'image/png');
  assert.equal(editValid.value?.imageSize, '2K');
});

test('parseImageDataUrl normalizes jpg mime type and rejects invalid data', () => {
  const parsed = parseImageDataUrl(
    'data:image/jpg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgH'
  );
  assert.ok(parsed);
  assert.equal(parsed.mimeType, 'image/jpeg');

  assert.equal(parseImageDataUrl('not-a-data-url'), null);
  assert.equal(parseImageDataUrl('data:text/plain;base64,SGVsbG8='), null);
});

test('computeScreenFitScale fits 16:9 and 9:16 media inside 3D frame without stretching', () => {
  const landscapeFit = computeScreenFitScale(2.22, 1.22, aspectStringToRatio('16:9'));
  assert.ok(landscapeFit.scaleX <= 1 && landscapeFit.scaleY <= 1);
  assert.ok(Math.abs(landscapeFit.scaleY - 1) < 0.05);

  const portraitFit = computeScreenFitScale(2.22, 1.22, aspectStringToRatio('9:16'));
  assert.equal(portraitFit.scaleY, 1);
  assert.ok(portraitFit.scaleX > 0.25 && portraitFit.scaleX < 0.4);
});

test('createStudioActivityEntry builds formatted timestamped studio log item', () => {
  const entry = createStudioActivityEntry(
    'Studio Media memproyeksikan video 16:9 ke Layar Rapat 3D',
    new Date(2026, 10, 20, 9, 5, 7)
  );
  assert.equal(entry.timestamp, '09:05:07');
  assert.equal(entry.agentName, 'Studio Media');
  assert.equal(entry.category, 'task');
});
