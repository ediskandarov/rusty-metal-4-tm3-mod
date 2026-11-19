#include "tm3/projectile_motion.h"
#include "port/psyz/sdk.h"
#include <psyz/gte.h>

/* Compiled directly from the existing SDK's libgte/msc02.c by the shared module builder. */
extern short Tm3InverseRootTable[198];
extern int rsin(int angle);
extern int rcos(int angle);

static int16_t short_wrap(int32_t value)
{
    uint32_t bits = (uint32_t)value & 65535;
    return bits < 32768 ? (int16_t)bits : (int16_t)((int32_t)bits - 65536);
}
static int32_t word_wrap(uint32_t value)
{
    return value <= INT32_MAX ? (int32_t)value : -1 - (int32_t)(UINT32_MAX - value);
}
static int32_t shift_floor(int32_t value, unsigned shift)
{
    return value >= 0 ? value >> shift : -1 - ((-1 - value) >> shift);
}
static int32_t q12(int32_t value)
{
    return shift_floor(value, 12);
}

static void load_ir(const int32_t vector[3])
{
    for (int axis = 0; axis < 3; ++axis)
        Psyz_GteDataWrite(9 + axis, vector[axis]);
}
static void read_mac(int32_t vector[3])
{
    for (int axis = 0; axis < 3; ++axis)
        vector[axis] = word_wrap(Psyz_GteDataRead(25 + axis));
}
static void scale(const int16_t direction[3], int32_t amount, int32_t output[3])
{
    int32_t vector[3] = { direction[0], direction[1], direction[2] };
    load_ir(vector);
    Psyz_GteDataWrite(8, amount);
    Psyz_GteCommand(0x8003d); /* GPF sf=1 */
    read_mac(output);
}

/* Game-specific normalization at 8001e49c. PsyZ executes the original GTE
   operations; the game's index/shift sequence stays distinct from SDK APIs. */
void Tm3ProjectileNormalize(const int32_t input[3], int16_t output[3])
{
    int32_t products[3];
    load_ir(input);
    Psyz_GteCommand(0x28); /* SQR sf=0 */
    read_mac(products);
    uint32_t square = (uint32_t)products[0] + (uint32_t)products[1] + (uint32_t)products[2];
    unsigned leading = square & 0x80000000u ? 0 : (unsigned)Lzc(word_wrap(square)) & ~1u;
    uint32_t mantissa = leading >= 24 ? square << (leading - 24) : square >> (24 - leading);
    unsigned index = mantissa < 64 ? 0 : mantissa - 64;
    load_ir(input);
    Psyz_GteDataWrite(8, Tm3InverseRootTable[index]);
    Psyz_GteCommand(0x3d); /* GPF sf=0 */
    read_mac(products);
    unsigned shift = leading == 32 ? 31 : (31 - leading) / 2;
    for (int axis = 0; axis < 3; ++axis)
        output[axis] = short_wrap(shift_floor(products[axis], shift));
}

/* 8002728c / 800140c8: GPL sf=1 floors negative movement without +0x800. */
void Tm3ProjectileAdvance(Tm3ProjectileFlight* flight)
{
    int32_t velocity[3] = { flight->velocity[0], flight->velocity[1], flight->velocity[2] };
    int32_t position[3];
    load_ir(velocity);
    Psyz_GteDataWrite(8, 136);
    for (int axis = 0; axis < 3; ++axis)
        Psyz_GteDataWrite(25 + axis, flight->position[axis]);
    Psyz_GteCommand(0x8003e); /* GPL sf=1 */
    read_mac(position);
    for (int axis = 0; axis < 3; ++axis) {
        int32_t previous = flight->position[axis];
        flight->previous[axis] = previous;
        flight->position[axis] = short_wrap(position[axis]);
        flight->midpoint[axis] = (previous + flight->position[axis]) / 2;
    }
}

/* 80030880 reflects the travelled segment against the last contacted plane. */
void Tm3RicochetReflect(Tm3ProjectileFlight* flight, const int16_t normal[3], int32_t speed)
{
    int32_t delta[3], dot = 0;
    int16_t direction[3];
    for (int i = 0; i < 3; ++i)
        delta[i] = flight->previous[i] - flight->position[i];
    Tm3ProjectileNormalize(delta, direction);
    for (int i = 0; i < 3; ++i)
        dot += normal[i] * direction[i];
    int32_t twice = 2 * q12(dot + 2048);
    for (int i = 0; i < 3; ++i)
        delta[i] = q12(normal[i] * twice + 2048) - direction[i];
    Tm3ProjectileNormalize(delta, direction);
    scale(direction, speed, delta);
    for (int i = 0; i < 3; ++i)
        flight->velocity[i] = short_wrap(delta[i]);
}

/* 80031cac: yaw rotates the desired direction; Y is intentionally untouched. */
static void deviate(int16_t direction[3], int32_t angle)
{
    int32_t sine = rsin(angle), cosine = rcos(angle);
    int32_t x = direction[0], z = direction[2];
    direction[0] = short_wrap(q12(x * cosine - z * sine + 2048));
    direction[2] = short_wrap(q12(x * sine + z * cosine + 2048));
}

/* Guidance portion of 8002ebfc, after common movement/hit handling. */
void Tm3ProjectileGuide(Tm3ProjectileFlight* flight, const Tm3ProjectileTuning* tuning,
    const int16_t target[3], Tm3ProjectileRandom random, void* context)
{
    if (!target || !tuning->steering)
        return;
    int32_t velocity[3], delta[3];
    int16_t current[3], desired[3];
    for (int axis = 0; axis < 3; ++axis) {
        velocity[axis] = flight->velocity[axis];
        delta[axis] = (int32_t)target[axis] - flight->position[axis];
    }
    Tm3ProjectileNormalize(velocity, current);
    Tm3ProjectileNormalize(delta, desired);
    int32_t deviation = word_wrap((uint32_t)tuning->initial_deviation - (flight->age << 1));
    if (deviation > 0) {
        int32_t angle = deviation + random(context) % deviation;
        if (angle & 1)
            angle = -angle;
        deviate(desired, angle);
    }
    int32_t alignment = 4096;
    if (!tuning->omnidirectional_homing) {
        int32_t dot = 0;
        for (int axis = 0; axis < 3; ++axis)
            dot += current[axis] * desired[axis];
        alignment = q12(dot + 2048);
        if (alignment < 0)
            alignment = 0;
    }
    int32_t steering = q12(alignment * tuning->steering + 2048);
    int32_t correction[3];
    scale(desired, steering, correction);
    for (int axis = 0; axis < 3; ++axis)
        velocity[axis] = short_wrap(current[axis] + correction[axis]);
    Tm3ProjectileNormalize(velocity, current);
    scale(current, flight->speed, velocity);
    for (int axis = 0; axis < 3; ++axis)
        flight->velocity[axis] = short_wrap(velocity[axis]);
}

void Tm3ProjectileImpactForce(
    const Tm3ProjectileTuning* tuning, const int16_t direction[3], int32_t output[3])
{
    int32_t vector[3] = { direction[0], direction[1], direction[2] };
    load_ir(vector);
    Psyz_GteDataWrite(8, tuning->impact_force);
    Psyz_GteCommand(0x3d); /* GPF sf=0 */
    read_mac(output);
    output[1] = word_wrap((uint32_t)output[1] - ((uint32_t)tuning->impact_lift << 12));
}

static int32_t forward_speed(const int16_t forward[3], const int32_t velocity_q12[3])
{
    int64_t dot = 0;
    for (int axis = 0; axis < 3; ++axis)
        dot += (int64_t)forward[axis] * velocity_q12[axis];
    int32_t projected = word_wrap((uint32_t)((dot + 2048) >> 12));
    return q12(word_wrap((uint32_t)projected + 2048));
}

/* 80032d80 projects body motion onto the car's forward direction before taking
   the fixed 136/4096 step. Both GTE scalings narrow to signed halfwords. */
void Tm3AxelWaveStep(const int16_t forward[3], const int32_t body_velocity_q12[3], int16_t step[3])
{
    int32_t scaled[3];
    int16_t velocity[3];
    scale(forward, forward_speed(forward, body_velocity_q12), scaled);
    for (int axis = 0; axis < 3; ++axis)
        velocity[axis] = short_wrap(scaled[axis]);
    scale(velocity, 136, scaled);
    for (int axis = 0; axis < 3; ++axis)
        step[axis] = short_wrap(scaled[axis]);
}

uint16_t Tm3ProjectileLaunchVelocity(const Tm3ProjectileTuning* tuning, const int16_t forward[3],
    const int32_t body_velocity_q12[3], int rear, int16_t output[3])
{
    uint16_t speed = tuning->speed;
    if (!rear)
        speed = (uint16_t)(speed + forward_speed(forward, body_velocity_q12));
    int32_t velocity[3];
    scale(forward, speed, velocity);
    for (int axis = 0; axis < 3; ++axis)
        output[axis] = short_wrap(velocity[axis]);
    return speed;
}
