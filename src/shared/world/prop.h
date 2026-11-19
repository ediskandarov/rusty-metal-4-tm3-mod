#ifndef TM3_PROP_H
#define TM3_PROP_H
#include "decoration.h"
typedef struct {
    const struct PropResource* resource;
    Tm4CardQuadTexture* shaders;
    MATRIX transform;
    SVECTOR velocity;
    s16 burst_offsets[8], burst_sizes[8];
    u32 age;
    s32 health;
} Tm3Prop;
extern u32 Tm3PropSizeof;
extern const SnapshotField Tm3PropFields[];
s32 Tm3PropInstanceConstructor(Tm3Prop*, RegistryDirectory*);
void InteractBulletWithTm3Prop(void* bullet, void* prop);
void Tm3MissileHitsProp(void* missile, void* prop);
struct Car;
const MATRIX* Tm3RadarPose(struct Car*);
void Tm3PropProcess(Tm3Prop*);
void Tm3PropDisplay(Tm3Prop*, Tm4OrderingTag*, u8**, u8*, MATRIX*);
typedef struct {
    MATRIX transform;
    u32 group, age, angular_speed, linear_speed;
    u16 angle, moving;
} Tm3Transition;
extern u32 Tm3TransitionSizeof;
extern const SnapshotField Tm3TransitionFields[];
s32 Tm3TransitionInstanceConstructor(Tm3Transition*, RegistryDirectory*);
void Tm3TransitionProcess(Tm3Transition*);
void Tm3TransitionDisplay(Tm3Transition*, Tm4OrderingTag*, u8**, u8*, MATRIX*);
#endif
