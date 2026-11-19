#ifndef TM3_BODY_H
#define TM3_BODY_H
#include <stdint.h>

typedef enum {
    Tm3Auger,
    Tm3Axel,
    Tm3ClubKid,
    Tm3Firestarter,
    Tm3FlowerPower,
    Tm3Grimm,
    Tm3Hammerhead,
    Tm3Minion,
    Tm3Outlaw,
    Tm3Roadkill,
    Tm3Spectre,
    Tm3SweetTooth,
    Tm3Thumper,
    Tm3Warthog,
    Tm3Darkside,
    Tm3Primeval
} Tm3CarId;

/* Owned by the car and included in its snapshot. Auger's attack owns its angle. */
typedef struct {
    int32_t angle, frame, frame_ticks;
} Tm3BodyAnimation;

typedef enum {
    Tm3BodyStatic,
    Tm3BodyHidden,
    Tm3BodyRotateX,
    Tm3BodyRotateY,
    Tm3BodyRotateZ,
    Tm3BodyWheel4,
    Tm3BodyWheelOther
} Tm3BodyTransform;

typedef struct {
    Tm3BodyTransform transform;
    int32_t angle;
} Tm3BodyPose;

/* One original 30 Hz update. steering_angle is the signed front-wheel angle at TM3 car+0x72. */
void Tm3BodyAnimate(Tm3CarId car, Tm3BodyAnimation* state, int16_t steering_angle);
/* Custom groups only (selector >= 4). Centers are supplied by the current LOD.
   Wheel poses use TM3 car+0x134 for selector 4, car+0xe4 otherwise: signed byte
   +0x13 adds to center Y, signed halfword +0x2c supplies rotation around X. */
Tm3BodyPose Tm3BodyGroupPose(Tm3CarId car, int32_t selector, const Tm3BodyAnimation* state);
#endif
