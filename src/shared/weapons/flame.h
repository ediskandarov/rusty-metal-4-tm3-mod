#ifndef TM3_FLAME_H
#define TM3_FLAME_H
#include "snapshot_types.h"
#include "tm3/resources.h"
typedef struct {
    SVECTOR mount;
    s32 age;
} Emitter;
typedef struct {
    SVECTOR end, velocity;
    s32 age, size, frame, elapsed;
} Flame;
typedef struct {
    s32 ticks, seconds, frame, elapsed, width, height, lifetime, smoke_mask;
} Burn;

extern const SnapshotField emitter_fields[], flame_fields[], burn_fields[];
void Tm3GroundImpact(const SVECTOR* position, WebParticipantId source, s32 size, s32 count,
    s32 blast_size, s32 surface);
void Tm3Ignite(Car* car, Burn* touching, WebParticipantId source);
int Tm3FlamesRegister(RegistryDirectory* dir);
#endif
