#include "tm3/body.h"

/* CarProcess switch at 80018454; ordinary wheel integration happens earlier. */
void Tm3BodyAnimate(Tm3CarId car, Tm3BodyAnimation* state, int16_t steering_angle)
{
    switch (car) {
    case Tm3Axel:
        state->angle = steering_angle;
        break;
    case Tm3Firestarter:
    case Tm3Grimm:
        state->angle = 2 * (int32_t)steering_angle;
        break;
    case Tm3SweetTooth:
        state->angle = (state->angle + 17) & 4095;
        /* Fall through: Sweet Tooth and Outlaw alternate every three updates. */
    case Tm3Outlaw:
        if (state->frame_ticks <= 1) {
            state->frame_ticks = 3;
            if (++state->frame >= 2)
                state->frame = 0;
        } else {
            --state->frame_ticks;
        }
        break;
    default:
        break;
    }
}

/* Custom callbacks 80026598..80026904. The caller composes the returned local
   pose with the car matrix and applies lighting using the same local rotation. */
Tm3BodyPose Tm3BodyGroupPose(Tm3CarId car, int32_t selector, const Tm3BodyAnimation* state)
{
    Tm3BodyPose pose = { Tm3BodyStatic, 0 };
    switch (car) {
    case Tm3Auger:
        pose.transform = Tm3BodyRotateZ;
        pose.angle = state->angle;
        break;
    case Tm3Axel:
    case Tm3Firestarter:
    case Tm3Grimm:
        pose.transform = Tm3BodyRotateY;
        pose.angle = state->angle;
        break;
    case Tm3Minion:
    case Tm3Darkside:
        pose.transform = selector == 4 ? Tm3BodyWheel4 : Tm3BodyWheelOther;
        break;
    case Tm3Outlaw:
        if (selector != 4 + state->frame)
            pose.transform = Tm3BodyHidden;
        break;
    case Tm3SweetTooth:
        pose.transform = selector == 4 + state->frame ? Tm3BodyRotateY : Tm3BodyHidden;
        if (pose.transform != Tm3BodyHidden)
            pose.angle = state->angle;
        break;
    default:
        break;
    }
    return pose;
}
