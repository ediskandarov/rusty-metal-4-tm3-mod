#include "tm3/projectile_visual.h"
#include "port/psyz/sdk.h"
#include "tm3/projectile_motion.h"
#include <psyz/gte.h>
#include <string.h>

const Tm3ProjectilePresentation* Tm3ProjectileArtwork(int32_t profile)
{
    /* Callback records at 8007e238; model selectors at 8002f2dc,
       80031fc4 and 80032bc0; effect sizes from 8008a648. */
    static const Tm3ProjectilePresentation rocket = { 0, 10, 15, 1200, TM3_SPIN_NONE, 1 };
    static const Tm3ProjectilePresentation tumbling = { 24, 12, 15, 1080, TM3_SPIN_YAW_PITCH, 0 };
    static const Tm3ProjectilePresentation skull = { 8, 128, 0, 1280, TM3_SPIN_NONE, 0 };
    static const Tm3ProjectilePresentation grimm = { 8, 0, 15, 1400, TM3_SPIN_NONE, 0 };
    static const Tm3ProjectilePresentation flower = { 48, 0, -1, 1280, TM3_SPIN_YAW, 0 };
    switch (profile) {
    case 0: {
        static const Tm3ProjectilePresentation fire = { 0, 10, 15, 1880, TM3_SPIN_NONE, 1 };
        return &fire;
    }
    case 1: {
        static const Tm3ProjectilePresentation homing = { 0, 10, 15, 1560, TM3_SPIN_NONE, 1 };
        return &homing;
    }
    case 2: {
        static const Tm3ProjectilePresentation power = { 0, 10, 15, 1180, TM3_SPIN_NONE, 1 };
        return &power;
    }
    case 4: {
        static const Tm3ProjectilePresentation napalm = { 0, 10, 13, 2000, TM3_SPIN_NONE, 1 };
        return &napalm;
    }
    case 5: {
        static const Tm3ProjectilePresentation ricochet = { 64, 0, 15, 1180, TM3_SPIN_NONE, 0 };
        return &ricochet;
    }
    case 8: {
        static const Tm3ProjectilePresentation mortar = { 32, 18, 22, 1180, TM3_SPIN_NONE, 1 };
        return &mortar;
    }
    case 7: {
        static const Tm3ProjectilePresentation rain = { 0, 8, 15, 880, TM3_SPIN_NONE, 0 };
        return &rain;
    }
    case 6: {
        static const Tm3ProjectilePresentation speed = { 0, 8, 14, 1280, TM3_SPIN_NONE, 1 };
        return &speed;
    }
    case 3: {
        static const Tm3ProjectilePresentation freeze = { 0, 10, 7, 1180, TM3_SPIN_NONE, 1 };
        return &freeze;
    }
    case 19: {
        static const Tm3ProjectilePresentation central = { 0, 10, 15, 1080, TM3_SPIN_NONE, 1 };
        return &central;
    }
    case 20: {
        static const Tm3ProjectilePresentation side = { 0, 10, 15, 1280, TM3_SPIN_NONE, 1 };
        return &side;
    }
    case 14:
    case 15:
        return &rocket;
    case 17: {
        static const Tm3ProjectilePresentation roadkill
            = { 24, 10, 0, 1880, TM3_SPIN_YAW_PITCH, 0 };
        return &roadkill;
    }
    case 18:
        return &grimm;
    case 21:
        return &flower;
    case 22:
        return &tumbling;
    case 23:
        return &skull;
    default:
        return NULL;
    }
}
void Tm3ProjectileModelPose(
    const MATRIX* transform, uint32_t age, Tm3ProjectileSpin spin, MATRIX* output)
{
    *output = *transform;
    if (spin != TM3_SPIN_NONE)
        RotMatrixY((age << 7) & 4095, output);
    if (spin == TM3_SPIN_YAW_PITCH)
        RotMatrixX(-((int32_t)((age << 8) & 4095)), output);
}

static int16_t short_wrap(int32_t value)
{
    uint32_t bits = (uint32_t)value & 65535;
    return bits < 32768 ? (int16_t)bits : (int16_t)((int32_t)bits - 65536);
}
void Tm3ProjectileOffsetLaunch(const MATRIX* transform, const int16_t offset[3], MATRIX* output)
{
    SVECTOR local = { offset[0], offset[1], offset[2], 0 }, world;
    ApplyMatrixSV((MATRIX*)transform, &local, &world);
    *output = *transform;
    /* 8002d7c4 adds the rotated offset to the forward axis and normalizes it. */
    if (offset[0] || offset[1] || offset[2]) {
        int16_t direction[3];
        for (int axis = 0; axis < 3; ++axis)
            direction[axis] = short_wrap(transform->m[axis][2] + (&world.vx)[axis]);
        Tm3ProjectileOrient(output, direction);
    }
}
void Tm3ProjectileSmokeVelocity(const int16_t velocity[3], int16_t output[3])
{
    output[0] = velocity[0] / 4;
    output[1] = -256;
    output[2] = velocity[2] / 4;
}
static void cross(const int16_t a[3], const int16_t b[3], int16_t output[3])
{
    for (int i = 0; i < 3; ++i) {
        Psyz_GteCtrlWrite(i * 2, a[i]);
        Psyz_GteDataWrite(9 + i, b[i]);
    }
    Psyz_GteCommand(0x8000c); /* OP sf=1, as in TM3 80013ec8. */
    for (int i = 0; i < 3; ++i)
        output[i] = short_wrap(Psyz_GteDataRead(25 + i));
}
static void frame_from_forward(MATRIX* matrix, int16_t forward[3])
{
    int32_t input[3];
    int16_t right[3], up[3];
    if (forward[0] && forward[2]) {
        matrix->m[0][0] = forward[2];
        matrix->m[1][0] = 0;
        matrix->m[2][0] = short_wrap(-forward[0]);
    }
    for (int i = 0; i < 3; ++i)
        input[i] = forward[i];
    Tm3ProjectileNormalize(input, forward);
    for (int i = 0; i < 3; ++i)
        right[i] = matrix->m[i][0];
    cross(forward, right, up);
    for (int i = 0; i < 3; ++i)
        input[i] = up[i];
    Tm3ProjectileNormalize(input, up);
    cross(up, forward, right);
    for (int i = 0; i < 3; ++i) {
        matrix->m[i][0] = right[i];
        matrix->m[i][1] = up[i];
        matrix->m[i][2] = forward[i];
    }
}
void Tm3ProjectileLaunchFrame(MATRIX* matrix)
{
    int16_t forward[3] = { matrix->m[0][2], matrix->m[1][2], matrix->m[2][2] };
    frame_from_forward(matrix, forward);
}
void Tm3ProjectileOrient(MATRIX* matrix, const int16_t velocity[3])
{
    int32_t input[3] = { velocity[0], velocity[1], velocity[2] };
    int16_t forward[3];
    Tm3ProjectileNormalize(input, forward);
    frame_from_forward(matrix, forward);
}
/* Guidance in 8002ef84 uses only the horizontal target offset. Even without
   a target it bends the forward column down by the global initialized at 8002d20c. */
void Tm3RoadkillGuide(
    MATRIX* frame, uint16_t speed, uint16_t steering, const int16_t target[3], int16_t velocity[3])
{
    for (int axis = 0; axis < 3; ++axis)
        Psyz_GteDataWrite(9 + axis, frame->m[axis][2]);
    Psyz_GteDataWrite(8, speed);
    Psyz_GteCommand(0x8003d);
    for (int axis = 0; axis < 3; ++axis)
        velocity[axis] = short_wrap(Psyz_GteDataRead(25 + axis));

    SVECTOR correction = { 0 };
    if (target) {
        int32_t dx = target[0] - frame->t[0], dz = target[2] - frame->t[2];
        int32_t turn = (dx * frame->m[0][0] + dz * frame->m[2][0]) >> 12;
        if (turn > steering)
            turn = steering;
        if (turn < -(int32_t)steering)
            turn = -(int32_t)steering;
        SVECTOR local = { short_wrap(turn), 0, 0, 0 };
        ApplyMatrixSV(frame, &local, &correction);
    }
    int32_t direction[3] = { frame->m[0][2] + correction.vx,
        frame->m[1][2] + short_wrap(correction.vy + 222), frame->m[2][2] + correction.vz };
    int16_t forward[3];
    Tm3ProjectileNormalize(direction, forward);
    frame_from_forward(frame, forward);
}
void Tm3MissileTrailInit(Tm3MissileTrail* trail, const int16_t position[3], uint32_t color,
    uint32_t width, uint32_t count)
{
    memset(trail, 0, sizeof(*trail));
    for (int section = 0; section < 8; ++section)
        for (int edge = 0; edge < 3; ++edge)
            memcpy(trail->sections[section][edge], position, 6);
    trail->count = count;
    trail->head = count - 1;
    trail->width = width;
    for (unsigned channel = 0; channel < 24; channel += 8)
        trail->color_step |= (((color >> channel) & 255) / count) << channel;
}
void Tm3MissileTrailStep(Tm3MissileTrail* trail, const MATRIX* matrix, uint32_t age)
{
    if (!(age % 2))
        trail->head = (trail->head + 1) % trail->count;
    int32_t width = trail->width;
    SVECTOR offsets[3]
        = { { -width, 0, -width, 0 }, { width, 0, -width, 0 }, { 0, width, -width, 0 } };
    for (int edge = 0; edge < 3; ++edge) {
        SVECTOR rotated;
        ApplyMatrixSV((MATRIX*)matrix, &offsets[edge], &rotated);
        int16_t* point = trail->sections[trail->head][edge];
        point[0] = short_wrap(rotated.vx + matrix->t[0]);
        point[1] = short_wrap(rotated.vy + matrix->t[1]);
        point[2] = short_wrap(rotated.vz + matrix->t[2]);
    }
}
void Tm3MissileTrailQuad(const Tm3MissileTrail* trail, uint32_t segment, uint32_t side,
    SVECTOR vertices[4], uint32_t colors[4])
{
    uint32_t first = (trail->head + 1 + segment) % trail->count, next = (first + 1) % trail->count;
    uint32_t edge = side ? 0 : 1;
    const int16_t* p[4] = { trail->sections[first][edge], trail->sections[next][edge],
        trail->sections[first][2], trail->sections[next][2] };
    for (int i = 0; i < 4; ++i) {
        vertices[i] = (SVECTOR) { p[i][0], p[i][1], p[i][2], 0 };
        colors[i] = (segment + (i & 1)) * trail->color_step;
    }
}
