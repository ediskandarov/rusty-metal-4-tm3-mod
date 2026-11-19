#ifndef TM3_PROJECTILE_VISUAL_H
#define TM3_PROJECTILE_VISUAL_H
#include <libgte.h>
#include "tm3/projectile_definition.h"
#include <stdint.h>

typedef struct {
    int16_t sections[8][3][3];
    uint32_t head, color_step, width, count;
} Tm3MissileTrail;
/* 80031fc4/80031df8: render-only rotations, using the original SDK order. */
void Tm3ProjectileModelPose(
    const MATRIX* transform, uint32_t age, Tm3ProjectileSpin spin, MATRIX* output);
void Tm3ProjectileOffsetLaunch(const MATRIX* transform, const int16_t offset[3], MATRIX* output);
void Tm3ProjectileSmokeVelocity(const int16_t velocity[3], int16_t output[3]);
/* 800150fc, preserving the previous right column for axis-aligned directions. */
void Tm3ProjectileLaunchFrame(MATRIX* matrix);
void Tm3ProjectileOrient(MATRIX* matrix, const int16_t velocity[3]);
/* Roadkill sets velocity from the current frame before steering the next frame. */
void Tm3BallisticGuide(
    MATRIX* frame, uint16_t speed, uint16_t steering, const int16_t target[3], int16_t velocity[3]);
/* Eight sections, a new section every second tick. Each launch color is
   divided into eight integer gradient steps; width comes from the profile. */
void Tm3MissileTrailInit(Tm3MissileTrail* trail, const int16_t position[3], uint32_t color,
    uint32_t width, uint32_t count);
void Tm3MissileTrailStep(Tm3MissileTrail* trail, const MATRIX* matrix, uint32_t age);
void Tm3MissileTrailQuad(const Tm3MissileTrail* trail, uint32_t segment, uint32_t side,
    SVECTOR vertices[4], uint32_t colors[4]);
#endif
