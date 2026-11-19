#include "../../src/cars/sweet-tooth/special.h"
#include <assert.h>

int main(void)
{
    Tm3SweetAnimation animation = { 0 };
    Tm3BodyAnimate(Tm3SweetTooth, &animation, 0);
    assert(animation.angle == 17 && animation.frame == 1 && animation.frame_ticks == 3);
    Tm3BodyAnimate(Tm3SweetTooth, &animation, 0);
    Tm3BodyAnimate(Tm3SweetTooth, &animation, 0);
    assert(animation.frame == 1);
    Tm3BodyAnimate(Tm3SweetTooth, &animation, 0);
    assert(animation.frame == 0);
    animation.angle = 4090;
    Tm3BodyAnimate(Tm3SweetTooth, &animation, 0);
    assert(animation.angle == 11);

    Tm3SweetFlight flight
        = { .position = { -100, 32767, -32768 }, .velocity = { -1, 5000, -5000 } };
    assert(!Tm3SweetStep(&flight));
    assert(flight.position[0] == -101 && flight.midpoint[0] == -100);
    assert(flight.position[1] == -32603 && flight.position[2] == 32601);
    assert(flight.previous[1] == 32767);
    for (int tick = 1; tick < 60; ++tick)
        assert(!Tm3SweetStep(&flight));
    assert(flight.age == 60);
    assert(Tm3SweetStep(&flight));
    assert(flight.age == 61);

    int16_t forward[3] = { 4096, 0, 0 }, output[3];
    int32_t moving[3] = { 2000 * 4096, -300 * 4096, 1500 * 4096 };
    Tm3SweetLaunchVelocity(forward, moving, 0, output);
    assert(output[0] == 7000 && output[1] == 0 && output[2] == 0);
    Tm3SweetLaunchVelocity(forward, moving, 1, output);
    assert(output[0] == 5000 && output[1] == 0 && output[2] == 0);
    moving[0] = -1000 * 4096;
    Tm3SweetLaunchVelocity(forward, moving, 0, output);
    assert(output[0] == 4000);
    return 0;
}
