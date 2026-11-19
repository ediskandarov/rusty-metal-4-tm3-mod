#include "tm3/body.h"
#include <assert.h>
#include <string.h>

int main(void)
{
    /* Steering-driven parts preserve negative angles, including signed extrema. */
    for (int steering = -32768; steering <= 32767; ++steering) {
        const Tm3CarId cars[] = { Tm3Axel, Tm3Firestarter, Tm3Grimm };
        for (int i = 0; i < 3; ++i) {
            Tm3BodyAnimation state = { 19, 1, 2 };
            Tm3BodyAnimate(cars[i], &state, steering);
            assert(state.angle == steering * (i == 0 ? 1 : 2));
            assert(state.frame == 1 && state.frame_ticks == 2);
            Tm3BodyPose pose = Tm3BodyGroupPose(cars[i], 4, &state);
            assert(pose.transform == Tm3BodyRotateY && pose.angle == state.angle);
        }
    }
    for (int car = 0; car < 16; ++car) {
        Tm3BodyAnimation state = { 4090, 0, 0 };
        Tm3BodyAnimate(car, &state, -100);
        if (car == Tm3Outlaw || car == Tm3SweetTooth) {
            assert(state.frame == 1 && state.frame_ticks == 3);
            assert(state.angle == (car == Tm3SweetTooth ? 11 : 4090));
            for (int tick = 0; tick < 2; ++tick) {
                Tm3BodyAnimate(car, &state, 0);
                assert(state.frame == 1);
            }
            Tm3BodyAnimate(car, &state, 0);
            assert(state.frame == 0 && state.frame_ticks == 3);
            for (int frame = 0; frame < 2; ++frame) {
                state.frame = frame;
                for (int selector = 4; selector <= 7; ++selector) {
                    Tm3BodyPose pose = Tm3BodyGroupPose(car, selector, &state);
                    if (selector != 4 + frame)
                        assert(pose.transform == Tm3BodyHidden);
                    else
                        assert(pose.transform
                            == (car == Tm3SweetTooth ? Tm3BodyRotateY : Tm3BodyStatic));
                }
            }
        } else if (car == Tm3Minion || car == Tm3Darkside) {
            assert(Tm3BodyGroupPose(car, 4, &state).transform == Tm3BodyWheel4);
            assert(Tm3BodyGroupPose(car, 5, &state).transform == Tm3BodyWheelOther);
            assert(state.angle == 4090);
        } else if (car == Tm3Auger) {
            Tm3BodyPose pose = Tm3BodyGroupPose(car, 4, &state);
            assert(pose.transform == Tm3BodyRotateZ && pose.angle == 4090);
        } else if (car != Tm3Axel && car != Tm3Firestarter && car != Tm3Grimm) {
            assert(Tm3BodyGroupPose(car, 4, &state).transform == Tm3BodyStatic);
            assert(state.angle == 4090 && state.frame == 0 && state.frame_ticks == 0);
        }
    }
    /* Restore midway through the frame timer and verify the same subsequent poses. */
    Tm3BodyAnimation state = { 0 }, saved, expected;
    for (int i = 0; i < 19; ++i)
        Tm3BodyAnimate(Tm3SweetTooth, &state, 0);
    saved = state;
    for (int i = 0; i < 301; ++i)
        Tm3BodyAnimate(Tm3SweetTooth, &state, 0);
    expected = state;
    state = saved;
    for (int i = 0; i < 301; ++i)
        Tm3BodyAnimate(Tm3SweetTooth, &state, 0);
    assert(memcmp(&state, &expected, sizeof(state)) == 0);
    return 0;
}
