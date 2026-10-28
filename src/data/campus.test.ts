import { describe, expect, it } from 'vitest';
import type { Activity } from '../types/activity';
import type { ChangeKind } from '../types/change';
import type { SimulatedSlotOption } from '../types/slot';
import { campusDataset } from './campus';

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const ID_PATTERN = /^(act|venue|eq|res|chg)-\d{3}$/;

const { activities, venues, equipment, resources, changes, slotCatalog } = campusDataset;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/** 严格校验 YYYY-MM-DDTHH:mm：形状 + 年月日时分有效范围 + 真实日历日（含闰年）。 */
function isValidLocalDateTime(value: string): boolean {
  const parts = value.match(DATE_TIME_PATTERN);
  if (parts === null) {
    return false;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);

  if (month < 1 || month > 12) {
    return false;
  }
  if (hour > 23 || minute > 59) {
    return false;
  }
  return day >= 1 && day <= daysInMonth(year, month);
}

/** 严格校验 HH:mm：形状 + 时分有效范围。 */
function isValidClockTime(value: string): boolean {
  const parts = value.match(CLOCK_TIME_PATTERN);
  if (parts === null) {
    return false;
  }
  return Number(parts[1]) <= 23 && Number(parts[2]) <= 59;
}

function collectIds(items: readonly { readonly id: string }[]): readonly string[] {
  return items.map((item) => item.id);
}

function duplicateIds(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      duplicated.add(id);
    }
    seen.add(id);
  }

  return [...duplicated];
}

describe('模拟数据集规模', () => {
  it('各集合均非空', () => {
    expect(activities.length).toBeGreaterThan(0);
    expect(venues.length).toBeGreaterThan(0);
    expect(equipment.length).toBeGreaterThan(0);
    expect(resources.length).toBeGreaterThan(0);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('数据量达到规格下限（6 场地 / 5 活动 / 4 变更 / 4 资源）', () => {
    expect(venues.length).toBeGreaterThanOrEqual(6);
    expect(activities.length).toBeGreaterThanOrEqual(5);
    expect(changes.length).toBeGreaterThanOrEqual(4);
    expect(resources.length).toBeGreaterThanOrEqual(4);
  });
});

describe('ID 规范与唯一性', () => {
  it('各集合内 ID 互不重复', () => {
    expect(duplicateIds(collectIds(activities))).toEqual([]);
    expect(duplicateIds(collectIds(venues))).toEqual([]);
    expect(duplicateIds(collectIds(equipment))).toEqual([]);
    expect(duplicateIds(collectIds(resources))).toEqual([]);
    expect(duplicateIds(collectIds(changes))).toEqual([]);
  });

  it('所有 ID 符合「前缀-三位序号」命名格式', () => {
    const allIds = [
      ...collectIds(activities),
      ...collectIds(venues),
      ...collectIds(equipment),
      ...collectIds(resources),
      ...collectIds(changes)
    ];

    expect(allIds.filter((id) => !ID_PATTERN.test(id))).toEqual([]);
  });
});

describe('引用完整性', () => {
  const venueIds = new Set(collectIds(venues));
  const activityIds = new Set(collectIds(activities));
  const equipmentIds = new Set(collectIds(equipment));
  const resourceIds = new Set(collectIds(resources));

  it('活动的 currentVenueId 均指向已定义场地', () => {
    const broken = activities.filter((activity) => !venueIds.has(activity.currentVenueId));
    expect(broken.map((activity) => activity.id)).toEqual([]);
  });

  it('变更的 activityId 均指向已定义活动', () => {
    const broken = changes.filter((change) => !activityIds.has(change.activityId));
    expect(broken.map((change) => change.id)).toEqual([]);
  });

  it('活动所需设备均在设备清单中', () => {
    const broken = activities
      .map((activity) => ({
        activityId: activity.id,
        missing: activity.requiredEquipmentIds.filter((id) => !equipmentIds.has(id))
      }))
      .filter((item) => item.missing.length > 0);

    expect(broken).toEqual([]);
  });

  it('场地设备均在设备清单中', () => {
    const broken = venues
      .map((venue) => ({
        venueId: venue.id,
        missing: venue.equipmentIds.filter((id) => !equipmentIds.has(id))
      }))
      .filter((item) => item.missing.length > 0);

    expect(broken).toEqual([]);
  });

  it('活动资源需求引用的资源均存在', () => {
    const broken = activities
      .map((activity) => ({
        activityId: activity.id,
        missing: Object.keys(activity.resourceNeeds).filter((key) => !resourceIds.has(key))
      }))
      .filter((item) => item.missing.length > 0);

    expect(broken).toEqual([]);
  });
});

describe('数值约束', () => {
  it('场地容量为正整数', () => {
    const broken = venues.filter((venue) => !Number.isInteger(venue.capacity) || venue.capacity <= 0);
    expect(broken.map((venue) => venue.id)).toEqual([]);
  });

  it('活动预计人数为非负整数', () => {
    const broken = activities.filter(
      (activity) => !Number.isInteger(activity.expectedAttendance) || activity.expectedAttendance < 0
    );
    expect(broken.map((activity) => activity.id)).toEqual([]);
  });

  it('资源总量与可用量为非负整数且可用量不超过总量', () => {
    const broken = resources.filter(
      (resource) =>
        !Number.isInteger(resource.total) ||
        !Number.isInteger(resource.available) ||
        resource.total < 0 ||
        resource.available < 0 ||
        resource.available > resource.total
    );
    expect(broken.map((resource) => resource.id)).toEqual([]);
  });

  it('资源需求量为非负整数', () => {
    const broken = activities
      .map((activity) => ({
        activityId: activity.id,
        invalid: Object.entries(activity.resourceNeeds)
          .filter(([, amount]) => !Number.isInteger(amount) || amount < 0)
          .map(([resourceId]) => resourceId)
      }))
      .filter((item) => item.invalid.length > 0);

    expect(broken).toEqual([]);
  });
});

describe('时间规范', () => {
  it('活动时间段与变更请求时间为合法的 YYYY-MM-DDTHH:mm', () => {
    const brokenSlots = activities.filter(
      (activity) =>
        !isValidLocalDateTime(activity.currentSlot.start) ||
        !isValidLocalDateTime(activity.currentSlot.end)
    );
    expect(brokenSlots.map((activity) => activity.id)).toEqual([]);

    const brokenRequests = changes.filter((change) => !isValidLocalDateTime(change.requestedAt));
    expect(brokenRequests.map((change) => change.id)).toEqual([]);
  });

  it('场地开放时间为合法的 HH:mm', () => {
    const broken = venues.filter(
      (venue) => !isValidClockTime(venue.openFrom) || !isValidClockTime(venue.openTo)
    );
    expect(broken.map((venue) => venue.id)).toEqual([]);
  });

  it('活动时间段满足 start 早于 end（半开区间 [start, end)）', () => {
    const broken = activities.filter(
      (activity) => !(activity.currentSlot.start < activity.currentSlot.end)
    );
    expect(broken.map((activity) => activity.id)).toEqual([]);
  });

  it('场地开放时段满足 openFrom 早于 openTo', () => {
    const broken = venues.filter((venue) => !(venue.openFrom < venue.openTo));
    expect(broken.map((venue) => venue.id)).toEqual([]);
  });
});

describe('场地开放时段完整性', () => {
  it('活动当前时间段处于对应场地的开放时间内（模拟活动均为单日活动）', () => {
    const broken: string[] = [];

    for (const activity of activities) {
      const venue = venues.find((item) => item.id === activity.currentVenueId);
      const sameDay = activity.currentSlot.start.slice(0, 10) === activity.currentSlot.end.slice(0, 10);
      const startClock = activity.currentSlot.start.slice(11, 16);
      const endClock = activity.currentSlot.end.slice(11, 16);
      const withinOpeningHours =
        venue !== undefined && startClock >= venue.openFrom && endClock <= venue.openTo;

      if (!sameDay || !withinOpeningHours) {
        broken.push(activity.id);
      }
    }

    expect(broken).toEqual([]);
  });
});

describe('模拟数据当前状态自洽性', () => {
  it('活动当前场地容量能够容纳预计参与人数', () => {
    const capacityByVenue = new Map<string, number>(
      venues.map((venue): [string, number] => [venue.id, venue.capacity])
    );

    const broken = activities.filter((activity) => {
      const capacity = capacityByVenue.get(activity.currentVenueId);
      return capacity === undefined || activity.expectedAttendance > capacity;
    });

    expect(broken.map((activity) => activity.id)).toEqual([]);
  });

  it('活动所需设备在当前场地可用', () => {
    const equipmentByVenue = new Map<string, Set<string>>(
      venues.map((venue): [string, Set<string>] => [venue.id, new Set<string>(venue.equipmentIds)])
    );

    const broken = activities
      .map((activity) => ({
        activityId: activity.id,
        missing: activity.requiredEquipmentIds.filter(
          (id) => !(equipmentByVenue.get(activity.currentVenueId)?.has(id) ?? false)
        )
      }))
      .filter((item) => item.missing.length > 0);

    expect(broken).toEqual([]);
  });
});

describe('变更载荷（payload）结构与取值', () => {
  const equipmentIds = new Set(collectIds(equipment));
  const venueIds = new Set(collectIds(venues));
  const resourceIds = new Set(collectIds(resources));

  const allowedPayloadKeys: Record<ChangeKind, readonly string[]> = {
    time: ['before', 'after'],
    venue: ['before', 'targetVenueId', 'minCapacity', 'requiredEquipmentIds'],
    scale: ['before', 'after'],
    resource: ['equipmentAdjustments', 'resourceAdjustments']
  };

  const requiredPayloadKeys: Record<ChangeKind, readonly string[]> = {
    time: ['after'],
    venue: ['minCapacity', 'requiredEquipmentIds'],
    scale: ['after'],
    resource: ['equipmentAdjustments', 'resourceAdjustments']
  };

  it('数据覆盖全部四种变更 kind', () => {
    const kinds = [...new Set(changes.map((change) => change.kind))].sort();
    expect(kinds).toEqual(['resource', 'scale', 'time', 'venue']);
  });

  it('kind 与 payload 的字段集合严格对应', () => {
    const broken = changes
      .map((change) => ({
        changeId: change.id,
        unexpected: Object.keys(change.payload).filter(
          (key) => !allowedPayloadKeys[change.kind].includes(key)
        )
      }))
      .filter((item) => item.unexpected.length > 0);

    expect(broken).toEqual([]);
  });

  it('每种 kind 的必填 payload 字段均存在', () => {
    const broken = changes
      .map((change) => ({
        changeId: change.id,
        missing: requiredPayloadKeys[change.kind].filter((key) => !(key in change.payload))
      }))
      .filter((item) => item.missing.length > 0);

    expect(broken).toEqual([]);
  });

  it('payload 的取值形态与 kind 对应', () => {
    const broken: string[] = [];

    for (const change of changes) {
      switch (change.kind) {
        case 'time': {
          const { after } = change.payload;
          if (typeof after.start !== 'string' || typeof after.end !== 'string') {
            broken.push(change.id);
          }
          break;
        }
        case 'scale': {
          const { after } = change.payload;
          if (typeof after !== 'number') {
            broken.push(change.id);
          }
          break;
        }
        case 'venue': {
          const { minCapacity, requiredEquipmentIds } = change.payload;
          if (typeof minCapacity !== 'number' || !Array.isArray(requiredEquipmentIds)) {
            broken.push(change.id);
          }
          break;
        }
        case 'resource': {
          const { equipmentAdjustments, resourceAdjustments } = change.payload;
          if (!Array.isArray(equipmentAdjustments) || !Array.isArray(resourceAdjustments)) {
            broken.push(change.id);
          }
          break;
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it('time 载荷：时间段合法、start 早于 end，且 before 与 after 不同', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'time') {
        continue;
      }
      const { before, after } = change.payload;
      const slots = before === undefined ? [after] : [before, after];
      const invalidSlot = slots.some(
        (slot) =>
          !isValidLocalDateTime(slot.start) ||
          !isValidLocalDateTime(slot.end) ||
          !(slot.start < slot.end)
      );
      const unchanged =
        before !== undefined && before.start === after.start && before.end === after.end;

      if (invalidSlot || unchanged) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('venue 载荷：minCapacity 为正整数，必需设备与目标场地引用有效', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'venue') {
        continue;
      }
      const { minCapacity, requiredEquipmentIds, targetVenueId } = change.payload;
      const invalidCapacity = !Number.isInteger(minCapacity) || minCapacity <= 0;
      const invalidEquipment = requiredEquipmentIds.filter((id) => !equipmentIds.has(id));
      const invalidTarget = targetVenueId !== undefined && !venueIds.has(targetVenueId);

      if (invalidCapacity || invalidEquipment.length > 0 || invalidTarget) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('scale 载荷：人数为非负整数，且 after 高于 before', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'scale') {
        continue;
      }
      const { before, after } = change.payload;
      const invalidAfter = !Number.isInteger(after) || after < 0;
      const invalidBefore = before !== undefined && (!Number.isInteger(before) || before < 0);
      const notIncrease = before !== undefined && after <= before;

      if (invalidAfter || invalidBefore || notIncrease) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('resource 载荷：调整项引用有效、数量合法且为上调', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'resource') {
        continue;
      }
      const { equipmentAdjustments, resourceAdjustments } = change.payload;

      const invalidEquipment = equipmentAdjustments.filter(
        (item) =>
          !equipmentIds.has(item.id) ||
          !Number.isInteger(item.after) ||
          item.after <= 0 ||
          (item.before !== undefined &&
            (!Number.isInteger(item.before) || item.before < 0 || item.after <= item.before))
      );

      const invalidResource = resourceAdjustments.filter(
        (item) =>
          !resourceIds.has(item.id) ||
          !Number.isInteger(item.after) ||
          item.after < 0 ||
          (item.before !== undefined &&
            (!Number.isInteger(item.before) || item.before < 0 || item.after <= item.before))
      );

      if (invalidEquipment.length > 0 || invalidResource.length > 0) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });
});

describe('变更载荷与活动当前状态一致性', () => {
  const activityById = new Map<string, Activity>(
    activities.map((activity): [string, Activity] => [activity.id, activity])
  );

  it('time 载荷的 before 与活动当前时间段一致', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'time') {
        continue;
      }
      const activity = activityById.get(change.activityId);
      const { before } = change.payload;
      if (activity === undefined || before === undefined) {
        continue;
      }
      if (before.start !== activity.currentSlot.start || before.end !== activity.currentSlot.end) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('venue 载荷的 before 与活动当前场地一致，且目标场地不同于当前场地', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'venue') {
        continue;
      }
      const activity = activityById.get(change.activityId);
      const { before, targetVenueId } = change.payload;
      if (activity === undefined) {
        continue;
      }
      if (before !== undefined && before !== activity.currentVenueId) {
        broken.push(change.id);
      }
      if (targetVenueId !== undefined && targetVenueId === activity.currentVenueId) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('scale 载荷的 before 与活动当前预计人数一致', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'scale') {
        continue;
      }
      const activity = activityById.get(change.activityId);
      const { before } = change.payload;
      if (activity === undefined || before === undefined) {
        continue;
      }
      if (before !== activity.expectedAttendance) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });

  it('resource 载荷的 before 与活动当前需求一致，缺省表示新增需求', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'resource') {
        continue;
      }
      const activity = activityById.get(change.activityId);
      if (activity === undefined) {
        continue;
      }

      for (const item of change.payload.resourceAdjustments) {
        const declared = Object.keys(activity.resourceNeeds).includes(item.id);
        const current = activity.resourceNeeds[item.id];
        const consistent =
          item.before === undefined ? !declared : declared && current === item.before;
        if (!consistent) {
          broken.push(`${change.id}:${item.id}`);
        }
      }

      for (const item of change.payload.equipmentAdjustments) {
        const currentRequired = activity.requiredEquipmentIds.includes(item.id);
        const consistent = item.before === undefined ? !currentRequired : currentRequired;
        if (!consistent) {
          broken.push(`${change.id}:${item.id}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });

  it('venue 载荷的目标场地满足容量下限与必需设备要求（数据自洽性）', () => {
    const broken: string[] = [];

    for (const change of changes) {
      if (change.kind !== 'venue') {
        continue;
      }
      const { targetVenueId, minCapacity, requiredEquipmentIds } = change.payload;
      if (targetVenueId === undefined) {
        continue;
      }
      const target = venues.find((venue) => venue.id === targetVenueId);
      if (target === undefined) {
        broken.push(change.id);
        continue;
      }

      const capacityOk = target.capacity >= minCapacity;
      const equipmentOk = requiredEquipmentIds.every((id) => target.equipmentIds.includes(id));
      if (!capacityOk || !equipmentOk) {
        broken.push(change.id);
      }
    }

    expect(broken).toEqual([]);
  });
});

describe('时间校验器自检', () => {
  it('日期时间校验拒绝越界值与非法日历日', () => {
    expect(isValidLocalDateTime('2026-10-16T09:00')).toBe(true);
    expect(isValidLocalDateTime('2024-02-29T23:59')).toBe(true);
    expect(isValidLocalDateTime('2026-02-29T09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-99-99T88:88')).toBe(false);
    expect(isValidLocalDateTime('2026-13-01T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-00-10T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-04-31T00:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T24:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T09:60')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16 09:00')).toBe(false);
    expect(isValidLocalDateTime('2026-10-16T9:0')).toBe(false);
  });

  it('时钟校验拒绝越界值与非补零格式', () => {
    expect(isValidClockTime('09:00')).toBe(true);
    expect(isValidClockTime('23:59')).toBe(true);
    expect(isValidClockTime('29:99')).toBe(false);
    expect(isValidClockTime('24:00')).toBe(false);
    expect(isValidClockTime('09:60')).toBe(false);
    expect(isValidClockTime('9:00')).toBe(false);
    expect(isValidClockTime('0900')).toBe(false);
  });
});

describe('数据确定性', () => {
  it('数据集为纯静态对象，可序列化且重复读取结果一致', () => {
    const first = JSON.stringify(campusDataset);
    const second = JSON.stringify(campusDataset);

    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual(campusDataset);
  });
});

/* ---------- F3-A 方案 B：显式模拟时段目录（slotCatalog）完整性 ---------- */

/** 目录条目唯一性复合键：activityId | venueId（缺省记作 *）| slot.start | slot.end。 */
function slotOptionKey(item: SimulatedSlotOption): string {
  return `${item.activityId}|${item.venueId ?? '*'}|${item.slot.start}|${item.slot.end}`;
}

/** 同一自然日内的时长（分钟）。与引擎的时长一致判定同口径（仅单日时段使用）。 */
function durationMinutesOf(slot: { readonly start: string; readonly end: string }): number {
  const toMinutes = (value: string): number =>
    Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  return toMinutes(slot.end) - toMinutes(slot.start);
}

describe('模拟时段目录（slotCatalog）完整性', () => {
  it('目录存在且非空（仅追加，不改变既有五个集合）', () => {
    expect(Array.isArray(slotCatalog)).toBe(true);
    expect((slotCatalog ?? []).length).toBeGreaterThan(0);
  });

  it('每条条目结构合法：activityId 与 slot 必填，条目不携带 ID 字段', () => {
    const broken: string[] = [];
    for (const item of slotCatalog ?? []) {
      const record = item as unknown as Record<string, unknown>;
      if (typeof item.activityId !== 'string') {
        broken.push(`${slotOptionKey(item)}：缺 activityId`);
      }
      if (!ID_PATTERN.test(item.activityId)) {
        broken.push(`${slotOptionKey(item)}：activityId 命名不合规（含空值）`);
      }
      if (item.venueId !== undefined && !ID_PATTERN.test(item.venueId)) {
        broken.push(`${slotOptionKey(item)}：venueId 命名不合规`);
      }
      if (item.slot === null || typeof item.slot !== 'object') {
        broken.push(`${slotOptionKey(item)}：缺 slot`);
      } else if ('id' in record) {
        broken.push(`${slotOptionKey(item)}：条目不应携带 slot ID`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('activityId 均指向已定义活动，venueId（若有）均指向已定义场地', () => {
    const activityIds = new Set(collectIds(activities));
    const venueIds = new Set(collectIds(venues));
    const broken: string[] = [];

    for (const item of slotCatalog ?? []) {
      if (!activityIds.has(item.activityId)) {
        broken.push(`${slotOptionKey(item)}：活动未定义`);
      }
      if (item.venueId !== undefined && !venueIds.has(item.venueId)) {
        broken.push(`${slotOptionKey(item)}：场地未定义`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('起止时间均为合法 YYYY-MM-DDTHH:mm，且 start 早于 end', () => {
    const broken: string[] = [];
    for (const item of slotCatalog ?? []) {
      const { start, end } = item.slot;
      if (!isValidLocalDateTime(start) || !isValidLocalDateTime(end)) {
        broken.push(`${slotOptionKey(item)}：时间格式非法`);
        continue;
      }
      if (!(start < end)) {
        broken.push(`${slotOptionKey(item)}：start 不早于 end`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('时段不跨日（start/end 同一自然日）', () => {
    const broken = (slotCatalog ?? [])
      .filter((item) => item.slot.start.slice(0, 10) !== item.slot.end.slice(0, 10))
      .map((item) => slotOptionKey(item));
    expect(broken).toEqual([]);
  });

  it('每条条目时长与其活动 currentSlot 时长一致（不一致条目不会进入候选集）', () => {
    const durationByActivity = new Map<string, number>(
      activities.map((activity): [string, number] => [
        activity.id,
        durationMinutesOf(activity.currentSlot)
      ])
    );
    const broken: string[] = [];

    for (const item of slotCatalog ?? []) {
      const base = durationByActivity.get(item.activityId);
      if (base === undefined) {
        broken.push(`${slotOptionKey(item)}：活动未定义，无法比对时长`);
        continue;
      }
      if (durationMinutesOf(item.slot) !== base) {
        broken.push(`${slotOptionKey(item)}：时长与活动 currentSlot 不一致`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('activityId + venueId + slot 组合键全局唯一（重复条目由 candidateKey 去重）', () => {
    const keys = (slotCatalog ?? []).map((item) => slotOptionKey(item));
    expect(duplicateIds(keys)).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('目录数据可序列化且重复读取结果一致（确定性）', () => {
    const first = JSON.stringify(slotCatalog);
    const second = JSON.stringify(slotCatalog);
    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual(slotCatalog);
  });

  it('演示场景：act-003 具备多时段、act-001 具备指定场地的组合演示条目', () => {
    const entries = slotCatalog ?? [];
    const act003 = entries.filter((item) => item.activityId === 'act-003');
    const act001 = entries.filter(
      (item) => item.activityId === 'act-001' && item.venueId !== undefined
    );
    expect(act003.length).toBeGreaterThanOrEqual(2);
    expect(new Set(act003.map((item) => item.slot.start)).size).toBeGreaterThanOrEqual(2);
    expect(act001.length).toBeGreaterThanOrEqual(1);
  });
});
