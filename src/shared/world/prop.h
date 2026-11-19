#ifndef TM3_PROP_H
#define TM3_PROP_H
#include "decoration.h"
#include "tm3/prop.h"
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
