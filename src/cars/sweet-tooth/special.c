#include "special.h"

/* Explicit wrapping avoids implementation-defined unsigned-to-signed narrowing. */
static int16_t short_wrap(int32_t value)
{
    uint32_t bits = (uint32_t)value & 65535;
    return bits < 32768 ? (int16_t)bits : (int16_t)((int32_t)bits - 65536);
}

/* TM3's GTE GPL with sf=1 truncates toward negative infinity, without +0x800. */
static int32_t q12_floor(int32_t value)
{
    return value >= 0 ? value / 4096 : -1 - (-1 - value) / 4096;
}

/* 80032438 / 800140c8: velocity is already in world units/second. */
int Tm3SweetStep(Tm3SweetFlight* flight)
{
    for (int axis = 0; axis < 3; ++axis) {
        int32_t previous = flight->position[axis];
        flight->previous[axis] = previous;
        flight->position[axis] = short_wrap(previous + q12_floor(136 * flight->velocity[axis]));
        /* The broad-phase center uses C division, unlike the GPL movement. */
        flight->midpoint[axis] = (previous + flight->position[axis]) / 2;
    }
    return ++flight->age > TM3_SWEET_LIFETIME;
}

/* 8002da84: inherit only the body's projected forward speed, never lateral drift. */
void Tm3SweetLaunchVelocity(
    const int16_t forward[3], const int32_t body_velocity_q12[3], int rear, int16_t output[3])
{
    int32_t speed = TM3_SWEET_SPEED;
    if (!rear) {
        int64_t dot = 0;
        for (int axis = 0; axis < 3; ++axis)
            dot += (int64_t)forward[axis] * body_velocity_q12[axis];
        int32_t projected = (int32_t)((dot + 2048) >> 12);
        speed = (uint16_t)(speed + q12_floor(projected + 2048));
    }
    for (int axis = 0; axis < 3; ++axis)
        output[axis] = short_wrap(q12_floor(speed * forward[axis]));
}
