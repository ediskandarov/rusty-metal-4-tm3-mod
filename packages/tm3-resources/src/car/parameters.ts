import { at, Binary, requireValue } from "../shared/binary.ts";
// Confirmed TM3 CAR consumers, not the TM4 physics ABI. Unresolved bytes stay lossless.
export const parameterFields = [
  ["radar_color", 0x0, "B", 3],
  ["drivetrain", 0x3, "b", 1],
  ["mass_top", 0x4, "H", 1],
  ["mass_bottom", 0x6, "H", 1],
  ["gear_radius", 0x8, "h", 6],
  ["idle_axle_torque", 0x14, "i", 1],
  ["maximum_axle_torque", 0x18, "i", 1],
  ["engine_axle_friction", 0x1c, "i", 1],
  ["wheel_axle_friction_torque", 0x20, "i", 1],
  ["maximum_brake_kinetic_torque", 0x28, "i", 1],
  ["bounds_y_min_scale_q12", 0x2c, "h", 1],
  ["bounds_x_scale_adjustment_q12", 0x2e, "h", 1],
  ["bounds_z_scale_adjustment_q12", 0x30, "h", 1],
  ["engine_pitch_base", 0x32, "H", 1],
  ["engine_pitch_gain", 0x34, "h", 1],
  ["engine_sound_id", 0x36, "B", 1],
  ["runtime_sound_bank", 0x37, "B", 1],
  ["engine_volume_base", 0x38, "H", 1],
  ["engine_volume_gain", 0x3a, "h", 1],
  ["collision_damage_dealt_q12", 0x3c, "h", 1],
  ["collision_damage_received_q12", 0x3e, "h", 1],
  ["surface_friction_adjustment", 0x40, "h", 1],
  ["health_by_control_and_difficulty", 0x42, "h", 9],
  ["ai_throttle_forward_max", 0x54, "B", 1],
  ["ai_throttle_reverse_max", 0x55, "B", 1],
  ["ai_pathing_speed_max", 0x56, "h", 1],
  ["ai_probe_center_factor", 0x58, "h", 1],
  ["ai_probe_whisker_length", 0x5a, "h", 1],
  ["ai_enemy_detection_distance_max", 0x5c, "h", 1],
  ["ai_enemy_repel_distance", 0x68, "h", 1],
  ["ai_enemy_pursue_distance", 0x6a, "h", 1],
  ["ai_fire_delay_by_difficulty", 0x70, "h", 3],
  ["ai_sector_angles", 0x78, "h", 4],
  ["ai_sector_distances", 0x80, "h", 3],
  ["ai_retaliation_damage_threshold", 0x86, "h", 1],
  ["ai_weapon_5_detonation_distances", 0x17c, "h", 2],
  ["ai_weapon_8_detonation_distances", 0x180, "h", 2],
  ["ai_sweet_detonation_distances", 0x184, "h", 2],
  ["turbo_engine_multiplier_q12", 0x1a6, "h", 1],
] as const;
export interface CarParameters {
  radar_color: number[];
  drivetrain: number;
  mass_top: number;
  mass_bottom: number;
  gear_radius: number[];
  idle_axle_torque: number;
  maximum_axle_torque: number;
  engine_axle_friction: number;
  wheel_axle_friction_torque: number;
  maximum_brake_kinetic_torque: number;
  bounds_y_min_scale_q12: number;
  bounds_x_scale_adjustment_q12: number;
  bounds_z_scale_adjustment_q12: number;
  engine_pitch_base: number;
  engine_pitch_gain: number;
  engine_sound_id: number;
  runtime_sound_bank: number;
  engine_volume_base: number;
  engine_volume_gain: number;
  collision_damage_dealt_q12: number;
  collision_damage_received_q12: number;
  surface_friction_adjustment: number;
  health_by_control_and_difficulty: number[];
  ai_throttle_forward_max: number;
  ai_throttle_reverse_max: number;
  ai_pathing_speed_max: number;
  ai_probe_center_factor: number;
  ai_probe_whisker_length: number;
  ai_enemy_detection_distance_max: number;
  ai_enemy_repel_distance: number;
  ai_enemy_pursue_distance: number;
  ai_fire_delay_by_difficulty: number[];
  ai_sector_angles: number[];
  ai_sector_distances: number[];
  ai_retaliation_damage_threshold: number;
  ai_weapon_5_detonation_distances: number[];
  ai_weapon_8_detonation_distances: number[];
  ai_sweet_detonation_distances: number[];
  turbo_engine_multiplier_q12: number;
  ai_sectors: {
    weight: number;
    weapon_weights: number[];
  }[];
  unresolved: {
    offset: number;
    hex: string;
  }[];
}
export function readParameters(bytes: Uint8Array): CarParameters {
  requireValue(bytes.length === 428, "Unsupported car parameter block size");
  const data = new Binary(bytes),
    known = new Uint8Array(bytes.length);
  const result = {} as CarParameters;
  for (const [name, offset, kind, count] of parameterFields) {
    const size = at({ B: 1, b: 1, H: 2, h: 2, i: 4 }, kind);
    const values = Array.from({ length: count }, (_, i) => data.number(kind, offset + i * size));
    Object.assign(result, { [name]: count === 1 ? at(values, 0) : values });
    known.fill(1, offset, offset + size * count);
  }
  result.ai_sectors = Array.from({ length: 12 }, (_, i) => ({
    weight: data.i32(0x8c + i * 20),
    weapon_weights: [...bytes.slice(0x90 + i * 20, 0xa0 + i * 20)],
  }));
  known.fill(1, 0x8c, 0x17c);
  result.unresolved = [];
  for (let offset = 0; offset < bytes.length;) {
    if (at(known, offset)) {
      ++offset;
      continue;
    }
    let end = offset + 1;
    while (end < bytes.length && !at(known, end)) ++end;
    result.unresolved.push({ offset, hex: data.hex(offset, end) });
    offset = end;
  }
  return result;
}
