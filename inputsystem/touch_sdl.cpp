//========= Copyright Valve Corporation, All rights reserved. ============//
//
// Purpose: Linux/Android touch implementation for inputsystem
//
//===========================================================================//

/* For force feedback testing. */
#include "inputsystem.h"
#include "tier1/convar.h"
#include "tier0/icommandline.h"
#include "SDL.h"
#include "SDL_touch.h"
// NOTE: This has to be the last file included!
#include "tier0/memdbgon.h"

//-----------------------------------------------------------------------------
// SDL finger ids are arbitrary 64-bit values. Android happens to hand out
// 0, 1, 2..., but browsers pass the DOM Touch.identifier, which on iPhone
// Safari is a large number. Used directly as an index (truncated to int, so
// often negative) it wrote outside m_touchAccumX/Y on every tap: the iPhone
// "out of bounds memory access" in CInputSystem::FingerEvent. Map each live
// finger to a small slot instead.
//-----------------------------------------------------------------------------
static SDL_FingerID s_FingerSlotId[TOUCH_FINGER_MAX_COUNT];
static bool s_FingerSlotUsed[TOUCH_FINGER_MAX_COUNT];

static int FingerSlot( SDL_FingerID id, bool bAllocate )
{
	for ( int i = 0; i < TOUCH_FINGER_MAX_COUNT; i++ )
	{
		if ( s_FingerSlotUsed[i] && s_FingerSlotId[i] == id )
			return i;
	}
	if ( !bAllocate )
		return -1;
	for ( int i = 0; i < TOUCH_FINGER_MAX_COUNT; i++ )
	{
		if ( !s_FingerSlotUsed[i] )
		{
			s_FingerSlotUsed[i] = true;
			s_FingerSlotId[i] = id;
			return i;
		}
	}
	return -1;	// more fingers than slots: ignore the extra one
}

//-----------------------------------------------------------------------------
// Handle the events coming from the Touch SDL subsystem.
//-----------------------------------------------------------------------------
int TouchSDLWatcher( void *userInfo, SDL_Event *event )
{
	CInputSystem *pInputSystem = (CInputSystem *)userInfo;

	if( !event || !pInputSystem ) return 1;

	int slot;
	switch ( event->type ) {
	case SDL_FINGERDOWN:
		slot = FingerSlot( event->tfinger.fingerId, true );
		if ( slot >= 0 )
			pInputSystem->FingerEvent( IE_FingerDown, slot, event->tfinger.x, event->tfinger.y, event->tfinger.dx, event->tfinger.dy );
		break;
	case SDL_FINGERUP:
		slot = FingerSlot( event->tfinger.fingerId, false );
		if ( slot >= 0 )
		{
			pInputSystem->FingerEvent( IE_FingerUp, slot, event->tfinger.x, event->tfinger.y, event->tfinger.dx, event->tfinger.dy );
			s_FingerSlotUsed[slot] = false;
		}
		break;
	case SDL_FINGERMOTION:
		// A finger that went down before the watcher existed gets a slot here.
		slot = FingerSlot( event->tfinger.fingerId, true );
		if ( slot >= 0 )
			pInputSystem->FingerEvent( IE_FingerMotion, slot, event->tfinger.x, event->tfinger.y, event->tfinger.dx, event->tfinger.dy );
		break;
	}

	return 1;
}

//-----------------------------------------------------------------------------
// Initialize all joysticks
//-----------------------------------------------------------------------------
void CInputSystem::InitializeTouch( void )
{
	if ( m_bTouchInitialized )
		ShutdownTouch();

	// abort startup if user requests no touch
	if ( CommandLine()->FindParm("-notouch") ) return;

	memset( m_touchAccumX, 0, sizeof(m_touchAccumX) );
	memset( m_touchAccumY, 0, sizeof(m_touchAccumY) );

	m_bJoystickInitialized = true;
	SDL_AddEventWatch(TouchSDLWatcher, this);
}

void CInputSystem::ShutdownTouch()
{
	if ( !m_bTouchInitialized )
		return;

	SDL_DelEventWatch( TouchSDLWatcher, this );
	m_bTouchInitialized = false;
}

bool CInputSystem::GetTouchAccumulators( int fingerId, float &dx, float &dy )
{
	if ( fingerId < 0 || fingerId >= TOUCH_FINGER_MAX_COUNT )
	{
		dx = dy = 0.f;
		return false;
	}
	dx = m_touchAccumX[fingerId];
	dy = m_touchAccumY[fingerId];

	m_touchAccumX[fingerId] = m_touchAccumY[fingerId] = 0.f;

	return true;
}

void CInputSystem::FingerEvent(int eventType, int fingerId, float x, float y, float dx, float dy)
{
	if( fingerId < 0 || fingerId >= TOUCH_FINGER_MAX_COUNT )
		return;

	if( eventType == IE_FingerUp )
	{
		m_touchAccumX[fingerId] = 0.f;
		m_touchAccumY[fingerId] = 0.f;
	}
	else
	{
		m_touchAccumX[fingerId] += dx;
		m_touchAccumY[fingerId] += dy;
	}

	int _x,_y;
	memcpy( &_x, &x, sizeof(float) );
	memcpy( &_y, &y, sizeof(float) );
	PostEvent(eventType, m_nLastSampleTick, fingerId, _x, _y);
}

