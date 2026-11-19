#ifndef TM3_WORLD_PROP_H
#define TM3_WORLD_PROP_H

#include "snapshot_types.h"
#include "tm3/resources.h"

typedef struct {
    SVECTOR vertices[4];
    u32 colors[4], shader;
} Tm3PropFace;

typedef struct Tm3PropResource {
    u32 header;
    SVECTOR origin;
    u16 range, health, speed, radius;
    s16 spin[3];
    u8 motion, faces;
    Tm3PropFace mesh[];
} Tm3PropResource;

typedef struct Tm3Prop Tm3Prop;
typedef struct {
    const char* name;
    void (*process)(Tm3Prop*);
    void (*destroyed)(Tm3Prop*, void* projectile);
} Tm3PropBehavior;

struct Tm3Prop {
    const Tm3PropResource* resource;
    Tm4CardQuadTexture* shaders;
    /* Template-bound like resource/shaders: restored locally, never serialized as an address. */
    const Tm3PropBehavior* behavior;
    MATRIX transform;
    SVECTOR velocity;
    s16 burst_offsets[8], burst_sizes[8];
    u32 age;
    s32 health;
};

extern u32 Tm3PropSizeof;
extern const SnapshotField Tm3PropFields[];
s32 Tm3PropInstanceConstructor(Tm3Prop*, RegistryDirectory*);
void InteractBulletWithTm3Prop(void* bullet, void* prop);
void Tm3MissileHitsProp(void* missile, void* prop);
void Tm3PropProcess(Tm3Prop*);
void Tm3PropSpin(Tm3Prop*);
void Tm3PropDisplay(Tm3Prop*, Tm4OrderingTag*, u8**, u8*, MATRIX*);

#endif
