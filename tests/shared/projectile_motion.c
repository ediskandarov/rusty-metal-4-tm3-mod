#include "tm3/projectile_motion.h"
#include "projectile_cases.h"
#include "tm3/projectile_visual.h"
#include <assert.h>
#include <stddef.h>
#include <string.h>

static unsigned draws;
static int32_t draw(void* context)
{
    uint32_t* seed = context;
    ++draws;
    *seed = *seed * 1103515245u + 12345u;
    return (*seed >> 16) & 32767;
}

/* Numerical results from executing the original 8002eca0..8002ef80 guidance
   instructions with original normalization, RNG and SDK trigonometry. Collision
   and display orientation are outside this math test. */
static const struct {
    int32_t profile;
    int16_t position[3], velocity[3], target[3];
    uint32_t age, seed;
    int16_t expected[3];
    uint32_t expected_seed;
} cases[] = {
    { 0, { 4773, -26675, 23783 }, { 879, -2238, -3112 }, { 28459, 10475, 28328 }, 19, 1866091889u,
        { 1627, -3688, -4484 }, 1866091889u },
    { 3, { -19619, 2427, -14251 }, { -3246, 1458, -3789 }, { 30697, -18807, -13490 }, 50,
        2220906810u, { -2951, 1184, -3352 }, 2220906810u },
    { 14, { 11096, 32702, -4438 }, { 1322, 361, -461 }, { -1739, -13492, 8295 }, 19, 2134406222u,
        { 4580, 1250, -1598 }, 550336879u },
    { 15, { -19299, 9622, -21247 }, { -2015, 2344, -2261 }, { 22869, 10540, 6471 }, 31, 1226895012u,
        { -3804, 3240, -223 }, 1653851149u },
    { 18, { 2592, -26301, 28599 }, { -928, -2692, 4980 }, { 15764, -25315, 18745 }, 10, 2732477583u,
        { -928, -2692, 4980 }, 2732477583u },
    { 19, { 8101, -685, -14659 }, { 1683, -3390, -255 }, { 15106, 10380, -25037 }, 28, 2626798698u,
        { 1819, -3665, -276 }, 3890552155u },
    { 20, { 32277, 14730, -8180 }, { -2373, -3669, -4129 }, { -11176, -14026, -3851 }, 2,
        366028576u, { -401, -4013, -2991 }, 1723439321u },
    { 21, { -12521, 11399, 14175 }, { 4361, -2969, -3667 }, { -30356, 30355, -28909 }, 30,
        3840810092u, { 3508, -1341, -1404 }, 1838363189u },
    { 22, { 23345, 28538, 25408 }, { -1868, -1106, 5647 }, { -2653, 13564, -30261 }, 13, 825337693u,
        { -2273, -1304, 4282 }, 571525330u },
    { 23, { -20637, 11297, -22976 }, { 4506, 2608, 3861 }, { -30691, -13897, -131 }, 34,
        2934713998u, { 3360, 282, 4987 }, 2157135535u },
};

/* Original instructions from 8002f020 through 8002f288, including the GTE
   transform and frame normalization. Velocity uses the frame before steering. */
static void roadkill_guidance(void)
{
    const int16_t targets[][3]
        = { { 1200, 30000, 9500 }, { -9500, 1234, 3500 }, { 312, -3000, 0 } };
    const int16_t poses[][9] = {
        { 4108, 0, 0, 0, 4096, 222, 0, -222, 4096 },
        { 4124, -14, 256, 0, 4112, 222, -258, -222, 4096 },
        { 4124, 13, -256, 0, 4112, 222, 257, -222, 4096 },
        { 4108, -1, 12, 0, 4096, 222, -13, -222, 4096 },
    };
    for (int i = 0; i < 4; ++i) {
        MATRIX frame
            = { .m = { { 4096, 0, 0 }, { 0, 4096, 0 }, { 0, 0, 4096 } }, .t = { 300, 300, 500 } };
        int16_t velocity[3];
        Tm3BallisticGuide(&frame, 5000, 256, i ? targets[i - 1] : NULL, velocity);
        assert(velocity[0] == 0 && velocity[1] == 0 && velocity[2] == 5000);
        assert(!memcmp(frame.m, poses[i], sizeof(frame.m)));
    }
}
static void visual(void)
{
    MATRIX frame
        = { .m = { { 4096, 0, 0 }, { 0, 4096, 0 }, { 0, 0, 4096 } }, .t = { 100, -200, 32760 } };
    int16_t forward[3] = { 0, 0, 5000 };
    Tm3ProjectileOrient(&frame, forward);
    /* Original 800150fc after the original velocity-normalization call. */
    assert(frame.m[0][0] == 4108 && frame.m[1][1] == 4102 && frame.m[2][2] == 4102);
    frame = (MATRIX) { .m = { { 4096, 0, 0 }, { 0, 4096, 0 }, { 0, 0, 4096 } },
        .t = { 100, -200, 32760 } };
    Tm3ProjectileLaunchFrame(&frame);
    const int16_t inputs[4][3]
        = { { 0, 0, 5000 }, { 5000, 0, 0 }, { 0, -5000, 0 }, { 0, 0, -5000 } };
    const int16_t original[4][9]
        = { { 4108, 0, 0, 0, 4102, 0, 0, 0, 4102 }, { 0, 0, 4102, 0, 0, 0, 0, 0, 0 },
              { 4110, 0, 0, 0, 0, -4103, 0, 4103, 0 }, { 4110, 0, 0, 0, -4103, 0, 0, 0, -4103 } };
    for (int i = 0; i < 4; ++i) {
        MATRIX m = { .m = { { 4096, 0, 0 }, { 0, 4096, 0 }, { 0, 0, 4096 } } };
        Tm3ProjectileOrient(&m, inputs[i]);
        assert(!memcmp(m.m, original[i], sizeof(m.m)));
    }
    const Tm3ProjectilePresentation* art = test_artwork(22);
    assert(art && art->descriptor == 24 && art->spin && !art->draw_ribbon);
    assert(art->effect_size == 12 && art->flight_pitch == 1080);
    art = test_artwork(23);
    assert(art && art->descriptor == 8 && !art->spin && !art->draw_ribbon);
    assert(art->effect_size == 128 && art->flight_sound == 0 && art->flight_pitch == 1280);
    assert(!test_artwork(-1) && !test_artwork(16));
    MATRIX base
        = { .m = { { 4096, 0, 0 }, { 0, 4096, 0 }, { 0, 0, 4096 } }, .t = { 712, -38, 5000 } },
        output;
    const int16_t poses[3][9] = { { 4017, 0, 799, -306, 3784, 1536, -739, -1567, 3711 },
        { -4017, 0, -799, 305, 3784, -1537, 738, -1567, -3712 },
        { 2896, 0, -2896, -2896, 0, -2896, 0, 4096, 0 } };
    const uint32_t ages[3] = { 1, 17, 60 };
    for (int i = 0; i < 3; ++i) {
        Tm3ProjectileModelPose(&base, ages[i], TM3_SPIN_YAW_PITCH, &output);
        assert(!memcmp(output.m, poses[i], sizeof(output.m)));
        assert(!memcmp(output.t, base.t, sizeof(output.t)));
        assert(base.m[0][0] == 4096 && base.m[0][1] == 0);
    }
    art = test_artwork(18);
    assert(art && art->descriptor == 8 && art->flight_sound == 15 && art->flight_pitch == 1400);
    assert(art->effect_size == 0 && art->spin == TM3_SPIN_NONE && !art->draw_ribbon);
    art = test_artwork(21);
    assert(art && art->descriptor == 48 && art->spin == TM3_SPIN_YAW && !art->draw_ribbon);
    assert(art->flight_sound == -1 && art->effect_size == 0);
    Tm3ProjectileModelPose(&base, 1, TM3_SPIN_YAW, &output);
    const int16_t flower_pose[9] = { 4017, 0, 799, 0, 4096, 0, -799, 0, 4017 };
    assert(!memcmp(output.m, flower_pose, sizeof(output.m)));
    assert(!memcmp(output.t, base.t, sizeof(output.t)));
    Tm3ProjectileModelPose(&base, 17, TM3_SPIN_NONE, &output);
    assert(!memcmp(&base, &output, sizeof(base)));
    int16_t offset[3] = { 0, -512, 0 };
    Tm3ProjectileOffsetLaunch(&base, offset, &output);
    assert(!memcmp(output.t, base.t, sizeof(output.t)));
    assert(output.m[1][2] < -400 && output.m[2][2] > 4000);
    RotMatrixZ(1024, &base);
    Tm3ProjectileOffsetLaunch(&base, offset, &output);
    assert(!memcmp(output.t, base.t, sizeof(output.t)));
    assert(output.m[0][2] > 400 && output.m[2][2] > 4000);
    int16_t smoke_input[3] = { -1, 2000, -5 }, smoke_output[3];
    Tm3ProjectileSmokeVelocity(smoke_input, smoke_output);
    assert(smoke_output[0] == 0 && smoke_output[1] == -256 && smoke_output[2] == -1);
    Tm3MissileTrail trail;
    int16_t position[3] = { 100, -200, 32760 };
    Tm3MissileTrailInit(&trail, position, 0x007800, 10, 8);
    Tm3MissileTrail other[3];
    const uint32_t launch_colors[3] = { 0xb4b4b4, 0x0000ff, 0xff0000 };
    const uint32_t gradients[3] = { 0x161616, 0x00001f, 0x1f0000 };
    for (int i = 0; i < 3; ++i) {
        Tm3MissileTrailInit(&other[i], position, launch_colors[i], 10, 8);
        assert(other[i].color_step == gradients[i]);
    }
    assert(trail.color_step == 15u << 8);
    assert(trail.head == 7);
    Tm3MissileTrailStep(&trail, &frame, 0);
    assert(trail.head == 0);
    assert(trail.sections[0][0][0] == 90 && trail.sections[0][0][1] == -200);
    assert(trail.sections[0][0][2] == 32750);
    assert(trail.sections[0][1][0] == 110 && trail.sections[0][2][1] == -190);
    frame.t[2] = 32780;
    Tm3MissileTrailStep(&trail, &frame, 1);
    assert(trail.head == 0 && trail.sections[0][0][2] == -32766);
    Tm3MissileTrail saved = trail, expected;
    for (uint32_t age = 2; age < 32; ++age)
        Tm3MissileTrailStep(&trail, &frame, age);
    expected = trail;
    trail = saved;
    for (uint32_t age = 2; age < 32; ++age)
        Tm3MissileTrailStep(&trail, &frame, age);
    assert(!memcmp(&trail, &expected, sizeof(trail)));
    SVECTOR vertices[4];
    uint32_t colors[4];
    Tm3MissileTrailQuad(&trail, 6, 0, vertices, colors);
    assert(colors[0] == 90u << 8 && colors[1] == 105u << 8);
    assert(vertices[0].vx == 110 && vertices[2].vy == -190);
    Tm3MissileTrailQuad(&trail, 6, 1, vertices, colors);
    assert(vertices[0].vx == 90);
    const Tm3ProjectileTuning* tuning = test_tuning(15);
    int16_t direction[3] = { 0, 0, 4096 }, velocity[3];
    int32_t body[3] = { 900 * 4096, 0, 700 * 4096 };
    assert(Tm3ProjectileLaunchVelocity(tuning, direction, body, 0, velocity) == 5700);
    assert(velocity[0] == 0 && velocity[1] == 0 && velocity[2] == 5700);
    assert(Tm3ProjectileLaunchVelocity(tuning, direction, body, 1, velocity) == 5000);
}

/* Outputs from original 80032d80 with equal velocities for its two body atoms. */
static void axel_wave_step(void)
{
    static const struct {
        int16_t forward[3];
        int32_t velocity_q12[3];
        int16_t expected[3];
    } samples[] = {
        { { 0, 0, 4096 }, { 0, 0, 0 }, { 0, 0, 0 } },
        { { 0, 0, 4096 }, { 10000, 55111, -3456789 }, { 0, 0, -29 } },
        { { 2896, 0, 2896 }, { -2000000, 3000000, 6000000 }, { 16, 0, 16 } },
        { { 1000, -2000, 3400 }, { 7000000, -3000000, 5400000 }, { 15, -31, 51 } },
    };
    for (unsigned i = 0; i < sizeof(samples) / sizeof(samples[0]); ++i) {
        int16_t step[3];
        Tm3BodyForwardStep(samples[i].forward, samples[i].velocity_q12, step);
        assert(!memcmp(step, samples[i].expected, sizeof(step)));
    }
}
int main(void)
{
    axel_wave_step();
    visual();
    roadkill_guidance();
    static const int32_t vectors[][3]
        = { { 0, 0, 0 }, { 1, 0, 0 }, { -1, 0, 0 }, { 32767, 32767, 32767 },
              { -32768, -32768, -32768 }, { 65535, 65536, -65537 }, { 100, -200, 300 } };
    static const int16_t normals[][3] = { { 0, 0, 0 }, { 4096, 0, 0 }, { -4096, 0, 0 },
        { 2370, 2370, 2370 }, { -2364, -2364, -2364 }, { -2896, 0, -2896 }, { 1097, -2195, 3291 } };
    for (unsigned i = 0; i < sizeof(vectors) / sizeof(vectors[0]); ++i) {
        int16_t actual[3];
        Tm3ProjectileNormalize(vectors[i], actual);
        assert(memcmp(actual, normals[i], sizeof(actual)) == 0);
    }
    for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        const Tm3ProjectileTuning* tuning = test_tuning(cases[i].profile);
        Tm3ProjectileFlight flight = { .age = cases[i].age, .speed = tuning->speed };
        memcpy(flight.position, cases[i].position, sizeof(flight.position));
        memcpy(flight.velocity, cases[i].velocity, sizeof(flight.velocity));
        uint32_t seed = cases[i].seed;
        draws = 0;
        Tm3ProjectileGuide(&flight, tuning, cases[i].target, draw, &seed);
        assert(memcmp(flight.velocity, cases[i].expected, sizeof(flight.velocity)) == 0);
        assert(seed == cases[i].expected_seed);
        assert(draws == (cases[i].seed != cases[i].expected_seed));
        assert(flight.age == cases[i].age);
        assert(memcmp(flight.position, cases[i].position, sizeof(flight.position)) == 0);
    }
    Tm3ProjectileFlight flight = { .position = { -100, 32767, -32768 },
        .velocity = { -1, 5000, -5000 },
        .age = 3,
        .speed = 5000 };
    Tm3ProjectileAdvance(&flight);
    assert(flight.position[0] == -101 && flight.midpoint[0] == -100);
    assert(flight.position[1] == -32603 && flight.position[2] == 32601);
    assert(flight.previous[1] == 32767 && flight.age == 3);
    uint32_t seed = 55;
    draws = 0;
    Tm3ProjectileGuide(&flight, test_tuning(15), NULL, draw, &seed);
    assert(draws == 0 && seed == 55 && flight.velocity[1] == 5000);

    const int16_t behind[3] = { 0, 0, -1000 };
    Tm3ProjectileTuning tuning = *test_tuning(15);
    tuning.initial_deviation = 0;
    flight = (Tm3ProjectileFlight) { .velocity = { 0, 0, 5000 }, .speed = 5000 };
    tuning.omnidirectional_homing = 0;
    Tm3ProjectileGuide(&flight, &tuning, behind, draw, &seed);
    assert(flight.velocity[2] == 5007 && draws == 0);
    flight = (Tm3ProjectileFlight) { .velocity = { 0, 0, 5000 }, .speed = 5000 };
    tuning.omnidirectional_homing = 1;
    tuning.steering = 5000;
    Tm3ProjectileGuide(&flight, &tuning, behind, draw, &seed);
    assert(flight.velocity[2] == -5011 && draws == 0);

    const int16_t forward[3] = { 0, 0, 4096 };
    int32_t impulse[3];
    Tm3ProjectileImpactForce(test_tuning(15), forward, impulse);
    assert(impulse[0] == 0 && impulse[1] == 0 && impulse[2] == 4096000);
    Tm3ProjectileImpactForce(test_tuning(20), forward, impulse);
    assert(impulse[0] == 0 && impulse[1] == -409600 && impulse[2] == 4915200);
    assert(test_tuning(20)->impact_size == 512);
    assert(test_tuning(15)->impact_size == 256);

    Tm3ProjectileFlight bounce = { .previous = { 0, 0, 0 }, .position = { 100, 0, 100 } };
    Tm3RicochetReflect(&bounce, (int16_t[3]) { -4096, 0, 0 }, 5000);
    assert(bounce.velocity[0] < -3400 && bounce.velocity[2] > 3400 && bounce.velocity[1] == 0);
    bounce.position[0] = bounce.position[2] = 0;
    bounce.position[1] = 100;
    Tm3RicochetReflect(&bounce, (int16_t[3]) { 0, -4096, 0 }, 3000);
    assert(bounce.velocity[0] == 0 && bounce.velocity[1] < -2950 && bounce.velocity[2] == 0);

    /* Seven full trajectories checked tick by tick against original movement
       and guidance instructions, including coordinate wrap and moving targets. */
    static const struct {
        int profile;
        int16_t position[3], velocity[3];
        uint32_t seed;
    } trajectories[] = {
        { 14, { -31291, -26252, 3965 }, { 3914, 3000, -822 }, 322768018u },
        { 15, { -31284, -26195, 3801 }, { 4096, 2873, -156 }, 4153166989u },
        { 19, { -32286, -27477, 3614 }, { 2892, 2893, 183 }, 4153166989u },
        { 20, { -31294, -26210, 3862 }, { 4058, 2894, -458 }, 4153166989u },
        { 21, { -32352, -27454, 3402 }, { 2931, 2701, 427 }, 4153166989u },
        { 22, { -31310, -26245, 3859 }, { 4022, 2938, -438 }, 4153166989u },
        { 23, { -30095, -25282, 3724 }, { 5310, 1984, -2015 }, 4153166989u },
    };
    for (unsigned i = 0; i < sizeof(trajectories) / sizeof(trajectories[0]); ++i) {
        const Tm3ProjectileTuning* profile = test_tuning(trajectories[i].profile);
        flight = (Tm3ProjectileFlight) { .position = { 30000, -32700, -800 },
            .velocity = { 3000, -1000, 4000 },
            .speed = profile->speed };
        seed = 1737;
        for (int tick = 0; tick < 60; ++tick) {
            int x = 31000 + tick * 81;
            const int16_t target[3]
                = { x < 32768 ? x : x - 65536, -27000 + tick * 31, 7000 - tick * 59 };
            Tm3ProjectileAdvance(&flight);
            Tm3ProjectileGuide(&flight, profile, target, draw, &seed);
            ++flight.age;
        }
        assert(memcmp(flight.position, trajectories[i].position, sizeof(flight.position)) == 0);
        assert(memcmp(flight.velocity, trajectories[i].velocity, sizeof(flight.velocity)) == 0);
        assert(seed == trajectories[i].seed && flight.age == 60);
    }

    /* Restoring both motion and RNG reproduces a multi-tick trajectory. */
    flight = (Tm3ProjectileFlight) { .velocity = { 0, 0, 5000 }, .speed = 5000 };
    Tm3ProjectileFlight saved = flight, expected;
    uint32_t saved_seed = seed;
    for (int repeat = 0; repeat < 2; ++repeat) {
        if (repeat) {
            flight = saved;
            seed = saved_seed;
        }
        for (int tick = 0; tick < 45; ++tick) {
            Tm3ProjectileAdvance(&flight);
            Tm3ProjectileGuide(&flight, test_tuning(15), behind, draw, &seed);
            ++flight.age;
        }
        if (!repeat)
            expected = flight;
        else {
            assert(memcmp(flight.position, expected.position, sizeof(flight.position)) == 0);
            assert(memcmp(flight.velocity, expected.velocity, sizeof(flight.velocity)) == 0);
        }
    }
    return 0;
}
