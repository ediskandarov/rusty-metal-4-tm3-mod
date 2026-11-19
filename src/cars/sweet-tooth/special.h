#ifndef TM3_SWEET_H
#define TM3_SWEET_H

#include "tm3/body.h"
#include <stdint.h>

enum {
    TM3_SWEET_SPEED = 5000,
    TM3_SWEET_LIFETIME = 60,
    TM3_SWEET_INTERACTION_RADIUS = 0,
    TM3_SWEET_BROAD_PHASE_RADIUS = 0,
    TM3_SWEET_RECOIL = 200,
    TM3_SWEET_IMPACT_SIZE = 256,
    TM3_SWEET_BLAST_TICKS = 20,
    TM3_SWEET_BLAST_FORCE = 2048,
    TM3_SWEET_BLAST_LIFT = 2000,
    TM3_SWEET_BLAST_DAMAGE = (TM3_SWEET_BLAST_FORCE + TM3_SWEET_BLAST_LIFT) / 4,
};

typedef struct {
    int16_t previous[3], position[3], velocity[3], midpoint[3];
    uint32_t age;
} Tm3SweetFlight;

typedef Tm3BodyAnimation Tm3SweetAnimation;

void Tm3SweetLaunchVelocity(
    const int16_t forward[3], const int32_t body_velocity_q12[3], int rear, int16_t output[3]);
int Tm3SweetStep(Tm3SweetFlight* flight);

#endif
