import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_DIVISIONS,
  computeWorkspaceAnalytics,
  createDefaultWeeklySchedule,
  getDivisionById,
  isTimeInsideSundayRest,
  validateChurchSourceInput,
} from './workspaceDivisions.ts';
import { createInitialShortsQueue } from './shortsFactory.ts';
import { createInitialSimulationState } from './simulation.ts';

describe('Workspace Divisions & Division Tools', () => {
  it('defines all 16 workspace divisions including Lantai 1, Lantai 2, and Lantai 3 workflow menus', () => {
    assert.equal(WORKSPACE_DIVISIONS.length, 16);
    assert.deepEqual(
      WORKSPACE_DIVISIONS.map((d) => d.label),
      [
        'Dashboard',
        'Performa & Tugas',
        'Kontrol Kantor 3D',
        'L1 · Daily Faith',
        'L2 · Stories 3D',
        'L3 · Bible Facts',
        'Channel YouTube',
        'AI Agent',
        'Guardian & Komunitas',
        'Bible Series',
        'Church Shorts',
        'Video Editor',
        'Produksi Konten',
        'Jadwal Publikasi',
        'Analitik & Laporan',
        'Pengaturan',
      ]
    );
    assert.equal(getDivisionById('performa-lantai').cameraZone, 'overview');
    assert.equal(getDivisionById('kontrol-3d').cameraZone, 'overview');
    assert.equal(getDivisionById('lantai-1').cameraZone, 'overview');
    assert.equal(getDivisionById('lantai-2').cameraZone, 'overview');
    assert.equal(getDivisionById('lantai-3').cameraZone, 'overview');
    assert.equal(getDivisionById('analitik-laporan').cameraZone, 'server');
    assert.equal(getDivisionById('video-editor').cameraZone, 'kode');
  });

  it('validates Church Shorts sermon source input accurately', () => {
    assert.equal(
      validateChurchSourceInput({ sermonTitle: 'X', transcript: 'terlalu pendek' }).ok,
      false
    );
    assert.equal(
      validateChurchSourceInput({
        sermonTitle: 'Khotbah Minggu: Pengharapan di Tengah Badai',
        transcript:
          'Hari ini kita merenungkan Mazmur 23 tentang Tuhan sebagai Gembala yang Baik yang menuntun langkah kita meski melewati lembah kekelaman.',
      }).ok,
      true
    );
  });

  it('builds a 7-day weekly publication schedule respecting Sunday 06:00–15:00 WIB rest window', () => {
    const queue = createInitialShortsQueue();
    const schedule = createDefaultWeeklySchedule(queue);
    assert.equal(schedule.length, 7);
    const sunday = schedule.find((s) => s.day === 'minggu');
    assert.ok(sunday);
    assert.equal(sunday.sundayRestProtected, true);
    assert.equal(isTimeInsideSundayRest('09:30 WIB'), true);
    assert.equal(isTimeInsideSundayRest('14:59 WIB'), true);
    assert.equal(isTimeInsideSundayRest('15:00 WIB'), false);
    assert.equal(isTimeInsideSundayRest('17:00 WIB'), false);
  });

  it('computes real-time analytics across all 3 YouTube channels and Guardian verdicts', () => {
    const queue = createInitialShortsQueue();
    queue[0] = { ...queue[0], stage: 'Siap Publikasi', guardianStatus: 'LULUS' };
    queue[1] = { ...queue[1], stage: 'Dalam Produksi', guardianStatus: 'PERLU REVISI' };

    const simState = createInitialSimulationState();
    const summary = computeWorkspaceAnalytics({ queue, simState, mediaItems: [] });

    assert.equal(summary.totalQueueItems, 3);
    assert.equal(summary.readyToPublishCount, 1);
    assert.equal(summary.guardianPassRatePercent, 50);
    assert.equal(summary.channels.length, 3);
    assert.equal(summary.channels[0].guardianPassedCount, 1);
    assert.equal(summary.channels[1].guardianBlockedCount, 1);
  });
});
