//========== Copyright 2005, Valve Corporation, All rights reserved. ========
//
// Purpose: A collection of utility classes to simplify thread handling, and
//			as much as possible contain portability problems. Here avoiding 
//			including windows.h.
//
//=============================================================================

#ifndef THREADTOOLS_H
#define THREADTOOLS_H

#include <limits.h>

#include "tier0/platform.h"
#include "tier0/dbg.h"

#if defined( POSIX ) && !defined( _PS3 ) && !defined( _X360 )
#include <pthread.h>
#include <errno.h>
#define WAIT_OBJECT_0 0
#define WAIT_TIMEOUT 0x00000102
#define WAIT_FAILED -1
#define THREAD_PRIORITY_HIGHEST 2
#endif

#if !defined( _X360 ) && !defined( _PS3 ) && defined(COMPILER_MSVC)
// For _ReadWriteBarrier()
#include <intrin.h>
#endif

#if defined( _PS3 )
#include <sys/ppu_thread.h>
#include <sys/synchronization.h>
#include <cell/atomic.h>
#include <sys/timer.h>
#endif

#ifdef OSX
// Add some missing defines
#define PTHREAD_MUTEX_TIMED_NP         PTHREAD_MUTEX_NORMAL
#define PTHREAD_MUTEX_RECURSIVE_NP     PTHREAD_MUTEX_RECURSIVE
#define PTHREAD_MUTEX_ERRORCHECK_NP    PTHREAD_MUTEX_ERRORCHECK
#define PTHREAD_MUTEX_ADAPTIVE_NP      3
#endif

#ifdef _PS3
#define PS3_SYS_PPU_THREAD_COMMON_STACK_SIZE ( 256 * 1024 )
#endif


#if defined( _WIN32 )
#pragma once
#pragma warning(push)
#pragma warning(disable:4251)

extern "C"
{
	void __declspec(dllimport) __stdcall Sleep( unsigned long );
}

#endif

#ifdef COMPILER_MSVC64
#include <intrin.h>
#endif

// #define THREAD_PROFILER 1

#define THREAD_MUTEX_TRACING_SUPPORTED
#if defined(_WIN32) && defined(_DEBUG) && !defined(THREAD_MUTEX_TRACING_ENABLED)
#define THREAD_MUTEX_TRACING_ENABLED
#endif

#ifdef _WIN32
typedef void *HANDLE;
#endif

// maximum number of threads that can wait on one object
#define CTHREADEVENT_MAX_WAITING_THREADS	4

// Start thread running  - error if already running
enum ThreadPriorityEnum_t
{
#if defined( PLATFORM_PS3 )
	TP_PRIORITY_NORMAL  = 1001,
	TP_PRIORITY_HIGH = 100,
	TP_PRIORITY_LOW = 2001,
	TP_PRIORITY_DEFAULT = 1001
#error "Need PRIORITY_LOWEST/HIGHEST"
#elif defined( LINUX )
    // We can use nice on Linux threads to change scheduling.
    // pthreads on Linux only allows priority setting on
    // real-time threads.
    // NOTE: Lower numbers are higher priority, thus the need
    // for TP_IS_PRIORITY_HIGHER.
	TP_PRIORITY_DEFAULT = 0,
	TP_PRIORITY_NORMAL = 0,
	TP_PRIORITY_HIGH = -10,
	TP_PRIORITY_LOW = 10,
	TP_PRIORITY_HIGHEST = -20,
	TP_PRIORITY_LOWEST = 19,
#else  // PLATFORM_PS3
	TP_PRIORITY_DEFAULT = 0,	//	THREAD_PRIORITY_NORMAL
	TP_PRIORITY_NORMAL = 0,	//	THREAD_PRIORITY_NORMAL
	TP_PRIORITY_HIGH = 1,	//	THREAD_PRIORITY_ABOVE_NORMAL
	TP_PRIORITY_LOW = -1,	//	THREAD_PRIORITY_BELOW_NORMAL
	TP_PRIORITY_HIGHEST = 2,	//	THREAD_PRIORITY_HIGHEST
	TP_PRIORITY_LOWEST = -2,	//	THREAD_PRIORITY_LOWEST 
#endif // PLATFORM_PS3
};

#if defined( LINUX )
#define TP_IS_PRIORITY_HIGHER( a, b ) ( ( a ) < ( b ) )
#else
#define TP_IS_PRIORITY_HIGHER( a, b ) ( ( a ) > ( b ) )
#endif

#if (defined( PLATFORM_WINDOWS_PC ) || defined( PLATFORM_X360 )) && !defined( STEAM ) && !defined( _CERT )
//Thread parent stack trace linkage requires ALL executing binaries to disable frame pointer omission to operate speedily/successfully. (/Oy-)  "vpc /nofpo"
#define THREAD_PARENT_STACK_TRACE_SUPPORTED 1 //uncomment to support joining the root of a thread's stack trace to its parent's at time of invocation. Must also set ENABLE_THREAD_PARENT_STACK_TRACING in stacktools.h
#endif

#if defined( THREAD_PARENT_STACK_TRACE_SUPPORTED )
#include "tier0/stacktools.h"
#	if defined( ENABLE_THREAD_PARENT_STACK_TRACING ) //stacktools.h opted in
#		define THREAD_PARENT_STACK_TRACE_ENABLED 1 //both threadtools.h and stacktools.h have opted into the feature, enable it
#	endif
#endif

extern bool gbCheckNotMultithreaded;

#ifdef _PS3

#define USE_INTRINSIC_INTERLOCKED

#define CHECK_NOT_MULTITHREADED()														\
{																						\
	static int init = 0;																\
	static sys_ppu_thread_t threadIDPrev;												\
																						\
	if (!init)																			\
	{																					\
		sys_ppu_thread_get_id(&threadIDPrev);											\
		init = 1;																		\
	}																					\
	else if (gbCheckNotMultithreaded)													\
	{																					\
		sys_ppu_thread_t threadID;														\
		sys_ppu_thread_get_id(&threadID);												\
		if (threadID != threadIDPrev)													\
		{																				\
			printf("CHECK_NOT_MULTITHREADED: prev thread = %x, cur thread = %x\n",		\
				(uint)threadIDPrev, (uint)threadID);												\
			*(int*)0 = 0;																\
		}																				\
	}																					\
}

#else // _PS3
	#define CHECK_NOT_MULTITHREADED()
#endif // _PS3

#if defined( _X360 ) || defined( _PS3 )
#define MAX_THREADS_SUPPORTED 16
#else
#define MAX_THREADS_SUPPORTED 32
#endif



//-----------------------------------------------------------------------------
//
//-----------------------------------------------------------------------------

const unsigned TT_INFINITE = 0xffffffff;
typedef uintp ThreadId_t;

//-----------------------------------------------------------------------------
//
// Simple thread creation. Differs from VCR mode/CreateThread/_beginthreadex
// in that it accepts a standard C function rather than compiler specific one.
//
//-----------------------------------------------------------------------------
#ifdef COMPILER_SNC
typedef uint64 ThreadHandle_t;
#else // COMPILER_SNC
FORWARD_DECLARE_HANDLE( ThreadHandle_t );
#endif // !COMPILER_SNC
typedef uintp (*ThreadFunc_t)( void *pParam );

#if defined( _PS3 )
PLATFORM_OVERLOAD ThreadHandle_t CreateSimpleThread( ThreadFunc_t, void *pParam, ThreadId_t *pID, unsigned stackSize = 0x10000 /*64*/ );
PLATFORM_INTERFACE ThreadHandle_t CreateSimpleThread( ThreadFunc_t, void *pParam, unsigned stackSize = 0x10000 /*64*/ );
#else //_PS3
PLATFORM_OVERLOAD ThreadHandle_t CreateSimpleThread( ThreadFunc_t, void *pParam, ThreadId_t *pID, unsigned stackSize = 0 );
PLATFORM_INTERFACE ThreadHandle_t CreateSimpleThread( ThreadFunc_t, void *pParam, unsigned stackSize = 0 );
#endif //_PS3
PLATFORM_INTERFACE bool ReleaseThreadHandle( ThreadHandle_t );


//-----------------------------------------------------------------------------

PLATFORM_INTERFACE ThreadId_t ThreadGetCurrentId();
PLATFORM_INTERFACE ThreadHandle_t ThreadGetCurrentHandle();
PLATFORM_INTERFACE int ThreadGetPriority( ThreadHandle_t hThread = NULL );
PLATFORM_INTERFACE bool ThreadSetPriority( ThreadHandle_t hThread, int priority );
inline		 bool ThreadSetPriority( int priority ) { return ThreadSetPriority( NULL, priority ); }
#ifndef _X360
PLATFORM_INTERFACE bool ThreadInMainThread();
PLATFORM_INTERFACE void DeclareCurrentThreadIsMainThread();
#else
PLATFORM_INTERFACE byte *g_pBaseMainStack;
PLATFORM_INTERFACE byte *g_pLimitMainStack;
inline bool ThreadInMainThread()
{
	byte b;
	byte *p = &b;
	return ( p < g_pBaseMainStack && p >= g_pLimitMainStack );
}
#endif

// NOTE: ThreadedLoadLibraryFunc_t needs to return the sleep time in milliseconds or TT_INFINITE
typedef uintp (*ThreadedLoadLibraryFunc_t)(void *pParam); 
PLATFORM_INTERFACE void SetThreadedLoadLibraryFunc( ThreadedLoadLibraryFunc_t func );
PLATFORM_INTERFACE ThreadedLoadLibraryFunc_t GetThreadedLoadLibraryFunc();

#if defined( PLATFORM_WINDOWS_PC32 )
DLL_IMPORT unsigned long STDCALL GetCurrentThreadId();
#define ThreadGetCurrentId GetCurrentThreadId
#endif

inline void ThreadPause()
{
#if defined( COMPILER_PS3 )
	__db16cyc();
#elif defined( COMPILER_GCC ) && (defined( __i386__ ) || defined( __x86_64__ ))
	__asm __volatile( "pause" );
#elif defined( POSIX )
        sched_yield();
#elif defined ( COMPILER_MSVC64 )
	_mm_pause();
#elif defined( COMPILER_MSVC32 )
	__asm pause;
#elif defined( COMPILER_MSVCX360 )
	YieldProcessor(); 
	__asm { or r0,r0,r0 } 
	YieldProcessor(); 
	__asm { or r1,r1,r1 } 
#else
#error "implement me"
#endif
}

inline void ThreadSleep(unsigned nMilliseconds = 0)
{
	if( nMilliseconds == 0 )
	{
		ThreadPause();
		return;
        }

#ifdef _WIN32

#ifdef _WIN32_PC
        static bool bInitialized = false;
        if ( !bInitialized )
        {
                bInitialized = true;
                // Set the timer resolution to 1 ms (default is 10.0, 15.6, 2.5, 1.0 or
                // some other value depending on hardware and software) so that we can
                // use Sleep( 1 ) to avoid wasting CPU time without missing our frame
                // rate.
                timeBeginPeriod( 1 );
        }
#endif
	Sleep( nMilliseconds );
#elif PS3
	sys_timer_usleep( nMilliseconds * 1000 );
#elif defined(POSIX)
        usleep( nMilliseconds * 1000 );
#endif
}

PLATFORM_INTERFACE bool ThreadJoin( ThreadHandle_t, unsigned timeout = TT_INFINITE );

PLATFORM_INTERFACE void ThreadSetDebugName( ThreadHandle_t hThread, const char *pszName );
inline		 void ThreadSetDebugName( const char *pszName ) { ThreadSetDebugName( NULL, pszName ); }

PLATFORM_INTERFACE void ThreadSetAffinity( ThreadHandle_t hThread, int nAffinityMask );


//-----------------------------------------------------------------------------
//
// Interlock methods. These perform very fast atomic thread
// safe operations. These are especially relevant in a multi-core setting.
//
//-----------------------------------------------------------------------------

#ifdef _WIN32
#define NOINLINE
#elif defined( _PS3 )
#define NOINLINE __attribute__ ((noinline))
#elif defined(POSIX)
#define NOINLINE __attribute__ ((noinline))
#endif

#if defined( _X360 ) || defined( _PS3 )
#define ThreadMemoryBarrier() __lwsync()
#elif defined(COMPILER_MSVC)
// Prevent compiler reordering across this barrier. This is
// sufficient for most purposes on x86/x64.
#define ThreadMemoryBarrier() _ReadWriteBarrier()
#elif defined(COMPILER_GCC)
// Prevent compiler reordering across this barrier. This is
// sufficient for most purposes on x86/x64.
// http://preshing.com/20120625/memory-ordering-at-compile-time
#define ThreadMemoryBarrier() asm volatile("" ::: "memory")
#else
#error Every platform needs to define ThreadMemoryBarrier to at least prevent compiler reordering
#endif

#if defined(GNUC)
#define USE_INTRINSIC_INTERLOCKED
// linux implementation
inline int32 ThreadInterlockedIncrement( int32 volatile *p )
{
	Assert( (size_t)p % 4 == 0 );
	return __sync_fetch_and_add( p, 1 ) + 1;
}

inline int32 ThreadInterlockedDecrement( int32 volatile *p )
{
	Assert( (size_t)p % 4 == 0 ); 
	return __sync_fetch_and_add( p, -1 ) - 1;
}

inline int32 ThreadInterlockedExchange( int32 volatile *p, int32 value )
{
	Assert( (size_t)p % 4 == 0 );
	return __sync_lock_test_and_set( p, value );
}

inline int32 ThreadInterlockedExchangeAdd( int32 volatile *p, int32 value )
{
	Assert( (size_t)p % 4 == 0 ); 
	return __sync_fetch_and_add( p, value );
}
inline int64 ThreadInterlockedExchangeAdd64( int64 volatile *p, int64 value )
{
	Assert( ( (size_t)p ) % 8 == 0 ); 
	return __sync_fetch_and_add( p, value );
}
inline int32 ThreadInterlockedCompareExchange( int32 volatile *p, int32 value, int32 comperand )
{
	Assert( (size_t)p % 4 == 0 ); 
	return __sync_val_compare_and_swap( p, comperand, value );
}


inline bool ThreadInterlockedAssignIf( int32 volatile *p, int32 value, int32 comperand )
{
	Assert( (size_t)p % 4 == 0 );
	return __sync_bool_compare_and_swap( p, comperand, value );
}

#elif ( defined( COMPILER_MSVC32 ) && ( _MSC_VER >= 1310 ) )
// windows 32 implemnetation using compiler intrinsics
#define USE_INTRINSIC_INTERLOCKED

extern "C"
{
	long __cdecl _InterlockedIncrement(volatile long*);
	long __cdecl _InterlockedDecrement(volatile long*);
	long __cdecl _InterlockedExchange(volatile long*, long);
	long __cdecl _InterlockedExchangeAdd(volatile long*, long);
	long __cdecl _InterlockedCompareExchange(volatile long*, long, long);
}

#pragma intrinsic( _InterlockedCompareExchange )
#pragma intrinsic( _InterlockedDecrement )
#pragma intrinsic( _InterlockedExchange )
#pragma intrinsic( _InterlockedExchangeAdd ) 
#pragma intrinsic( _InterlockedIncrement )

inline int32 ThreadInterlockedIncrement( int32 volatile *p )										{ Assert( (size_t)p % 4 == 0 ); return _InterlockedIncrement( (volatile long*)p ); }
inline int32 ThreadInterlockedDecrement( int32 volatile *p )										{ Assert( (size_t)p % 4 == 0 ); return _InterlockedDecrement( (volatile long*)p ); }
inline int32 ThreadInterlockedExchange( int32 volatile *p, int32 value )							{ Assert( (size_t)p % 4 == 0 ); return _InterlockedExchange( (volatile long*)p, value ); }
inline int32 ThreadInterlockedExchangeAdd( int32 volatile *p, int32 value )							{ Assert( (size_t)p % 4 == 0 ); return _InterlockedExchangeAdd( (volatile long*)p, value ); }
inline int32 ThreadInterlockedCompareExchange( int32 volatile *p, int32 value, int32 comperand )	{ Assert( (size_t)p % 4 == 0 ); return _InterlockedCompareExchange( (volatile long*)p, value, comperand ); }
inline bool ThreadInterlockedAssignIf( int32 volatile *p, int32 value, int32 comperand )			{ Assert( (size_t)p % 4 == 0 ); return ( _InterlockedCompareExchange( (volatile long*)p, value, comperand ) == comperand ); }
#elif defined( _PS3 )
PLATFORM_INTERFACE inline int32 ThreadInterlockedIncrement( int32 volatile * ea )											{ return cellAtomicIncr32( (uint32_t*)ea ) + 1; }
PLATFORM_INTERFACE inline int32 ThreadInterlockedDecrement( int32 volatile * ea )											{ return cellAtomicDecr32( (uint32_t*)ea ) - 1; }
PLATFORM_INTERFACE inline int32 ThreadInterlockedExchange( int32 volatile * ea, int32 value )								{ return cellAtomicStore32( ( uint32_t* )ea, value); }
PLATFORM_INTERFACE inline int32 ThreadInterlockedExchangeAdd( int32 volatile * ea, int32 value )							{ return cellAtomicAdd32( ( uint32_t* )ea, value ); }
PLATFORM_INTERFACE inline int32 ThreadInterlockedCompareExchange( int32 volatile * ea, int32 value, int32 comperand )		{ return cellAtomicCompareAndSwap32( (uint32_t*)ea, comperand, value ) ; }
PLATFORM_INTERFACE inline bool ThreadInterlockedAssignIf( int32 volatile * ea, int32 value, int32 comperand )				{ return ( cellAtomicCompareAndSwap32( (uint32_t*)ea, comperand, value ) == ( uint32_t ) comperand );  }

PLATFORM_INTERFACE inline int64 ThreadInterlockedCompareExchange64( int64 volatile *pDest, int64 value, int64 comperand )	{	return cellAtomicCompareAndSwap64( ( uint64_t* ) pDest, comperand, value ); }
PLATFORM_INTERFACE inline bool ThreadInterlockedAssignIf64( volatile int64 *pDest, int64 value, int64 comperand )			{ return ( cellAtomicCompareAndSwap64( ( uint64_t* ) pDest, comperand, value ) == ( uint64_t ) comperand ); }

#elif defined( _X360 )
#define TO_INTERLOCK_PARAM(p)		((volatile long *)p)
#define TO_INTERLOCK_PTR_PARAM(p)	((void **)p)
FORCEINLINE int32 ThreadInterlockedIncrement( int32 volatile *pDest )										{ Assert( (size_t)pDest % 4 == 0 ); return InterlockedIncrement( TO_INTERLOCK_PARAM(pDest) ); }
FORCEINLINE int32 ThreadInterlockedDecrement( int32 volatile *pDest )										{ Assert( (size_t)pDest % 4 == 0 ); return InterlockedDecrement( TO_INTERLOCK_PARAM(pDest) ); }
FORCEINLINE int32 ThreadInterlockedExchange( int32 volatile *pDest, int32 value )							{ Assert( (size_t)pDest % 4 == 0 ); return InterlockedExchange( TO_INTERLOCK_PARAM(pDest), value ); }
FORCEINLINE int32 ThreadInterlockedExchangeAdd( int32 volatile *pDest, int32 value )						{ Assert( (size_t)pDest % 4 == 0 ); return InterlockedExchangeAdd( TO_INTERLOCK_PARAM(pDest), value ); }
FORCEINLINE int32 ThreadInterlockedCompareExchange( int32 volatile *pDest, int32 value, int32 comperand )	{ Assert( (size_t)pDest % 4 == 0 ); return InterlockedCompareExchange( TO_INTERLOCK_PARAM(pDest), value, comperand ); }
FORCEINLINE bool ThreadInterlockedAssignIf( int32 volatile *pDest, int32 value, int32 comperand )			{ Assert( (size_t)pDest % 4 == 0 ); return ( InterlockedCompareExchange( TO_INTERLOCK_PARAM(pDest), value, comperand ) == comperand ); }
#else
// non 32-bit windows and 360 implementation
PLATFORM_INTERFACE int32 ThreadInterlockedIncrement( int32 volatile * ) NOINLINE;
PLATFORM_INTERFACE int32 ThreadInterlockedDecrement( int32 volatile * ) NOINLINE;
PLATFORM_INTERFACE int32 ThreadInterlockedExchange( int32 volatile *, int32 value ) NOINLINE;
PLATFORM_INTERFACE int32 ThreadInterlockedExchangeAdd( int32 volatile *, int32 value ) NOINLINE;
PLATFORM_INTERFACE int32 ThreadInterlockedCompareExchange( int32 volatile *, int32 value, int32 comperand ) NOINLINE;
PLATFORM_INTERFACE bool ThreadInterlockedAssignIf( int32 volatile *, int32 value, int32 comperand ) NOINLINE;
#endif


#if defined( USE_INTRINSIC_INTERLOCKED ) && !defined( PLATFORM_64BITS )
#define TIPTR()
inline void *ThreadInterlockedExchangePointer( void * volatile *p, void *value )							{ return (void *)( ( intp )ThreadInterlockedExchange( reinterpret_cast<intp volatile *>(p), reinterpret_cast<intp>(value) ) ); }
inline void *ThreadInterlockedCompareExchangePointer( void * volatile *p, void *value, void *comperand )	{ return (void *)( ( intp )ThreadInterlockedCompareExchange( reinterpret_cast<intp volatile *>(p), reinterpret_cast<intp>(value), reinterpret_cast<intp>(comperand) ) ); }
inline bool ThreadInterlockedAssignPointerIf( void * volatile *p, void *value, void *comperand )			{ return ( ThreadInterlockedCompareExchange( reinterpret_cast<intp volatile *>(p), reinterpret_cast<intp>(value), reinterpret_cast<intp>(comperand) ) == reinterpret_cast<intp>(comperand) ); }
#else
PLATFORM_INTERFACE void *ThreadInterlockedExchangePointer( void * volatile *, void *value ) NOINLINE;
PLATFORM_INTERFACE void *ThreadInterlockedCompareExchangePointer( void * volatile *, void *value, void *comperand ) NOINLINE;
PLATFORM_INTERFACE bool ThreadInterlockedAssignPointerIf( void * volatile *, void *value, void *comperand ) NOINLINE;
#endif


inline unsigned ThreadInterlockedExchangeSubtract( int32 volatile *p, int32 value )	{ return ThreadInterlockedExchangeAdd( (int32 volatile *)p, -value ); }

inline void const *ThreadInterlockedExchangePointerToConst( void const * volatile *p, void const *value )							{ return ThreadInterlockedExchangePointer( const_cast < void * volatile * > ( p ), const_cast < void * > ( value ) );  }
inline void const *ThreadInterlockedCompareExchangePointerToConst( void const * volatile *p, void const *value, void const *comperand )	{ return ThreadInterlockedCompareExchangePointer( const_cast < void * volatile * > ( p ), const_cast < void * > ( value ), const_cast < void * > ( comperand ) ); }
inline bool ThreadInterlockedAssignPointerToConstIf( void const * volatile *p, void const *value, void const *comperand )			{ return ThreadInterlockedAssignPointerIf( const_cast < void * volatile * > ( p ), const_cast < void * > ( value ), const_cast < void * > ( comperand ) ); }


#ifndef _PS3
PLATFORM_INTERFACE int64 ThreadInterlockedCompareExchange64( int64 volatile *, int64 value, int64 comperand ) NOINLINE;
PLATFORM_INTERFACE bool ThreadInterlockedAssignIf64( volatile int64 *pDest, int64 value, int64 comperand ) NOINLINE;
#endif

PLATFORM_INTERFACE int64 ThreadInterlockedExchange64( int64 volatile *, int64 value ) NOINLINE;

#ifdef COMPILER_MSVC32
PLATFORM_INTERFACE int64 ThreadInterlockedIncrement64( int64 volatile * ) NOINLINE;
PLATFORM_INTERFACE int64 ThreadInterlockedDecrement64( int64 volatile * ) NOINLINE;
PLATFORM_INTERFACE int64 ThreadInterlockedExchangeAdd64( int64 volatile *, int64 value ) NOINLINE;
#elif defined(POSIX)

inline int64 ThreadInterlockedIncrement64( int64 volatile *p )
{
	Assert( (size_t)p % 8 == 0 );
	return __sync_fetch_and_add( p, 1 ) + 1;
}

inline int64 ThreadInterlockedDecrement64( int64 volatile *p )
{
	Assert( (size_t)p % 8 == 0 ); 
	return __sync_fetch_and_add( p, -1 ) - 1;
}

#endif

#ifdef COMPILER_MSVC64
// 64 bit windows can use intrinsics for these, 32-bit can't
#pragma intrinsic( _InterlockedCompareExchange64 )
#pragma intrinsic( _InterlockedExchange64 )
#pragma intrinsic( _InterlockedExchangeAdd64 ) 
inline int64 ThreadInterlockedCompareExchange64( int64 volatile *p, int64 value, int64 comparand ) { AssertDbg( (size_t)p % 8 == 0 ); return _InterlockedCompareExchange64( (volatile int64*)p, value, comparand ); }
inline int64 ThreadInterlockedExchangeAdd64( int64 volatile *p, int64 value )							{ AssertDbg( (size_t)p % 8 == 0 ); return _InterlockedExchangeAdd64( (volatile int64*)p, value ); }
#endif

inline unsigned ThreadInterlockedExchangeSubtract( uint32 volatile *p, uint32 value )					{ return ThreadInterlockedExchangeAdd( (int32 volatile *)p, value ); }

inline unsigned ThreadInterlockedIncrement( uint32 volatile *p )										{ return ThreadInterlockedIncrement( (int32 volatile *)p ); }
inline unsigned ThreadInterlockedDecrement( uint32 volatile *p )										{ return ThreadInterlockedDecrement( (int32 volatile *)p ); }
inline unsigned ThreadInterlockedExchange( uint32 volatile *p, uint32 value )							{ return ThreadInterlockedExchange( (int32 volatile *)p, value ); }
inline unsigned ThreadInterlockedExchangeAdd( uint32 volatile *p, uint32 value )						{ return ThreadInterlockedExchangeAdd( (int32 volatile *)p, value ); }
inline unsigned ThreadInterlockedCompareExchange( uint32 volatile *p, uint32 value, uint32 comperand )	{ return ThreadInterlockedCompareExchange( (int32 volatile *)p, value, comperand ); }
inline bool ThreadInterlockedAssignIf( uint32 volatile *p, uint32 value, uint32 comperand )				{ return ThreadInterlockedAssignIf( (int32 volatile *)p, value, comperand ); }

//inline int ThreadInterlockedExchangeSubtract( int volatile *p, int value )	{ return ThreadInterlockedExchangeAdd( (int32 volatile *)p, value ); }
//inline int ThreadInterlockedIncrement( int volatile *p )	{ return ThreadInterlockedIncrement( (int32 volatile *)p ); }
//inline int ThreadInterlockedDecrement( int volatile *p )	{ return ThreadInterlockedDecrement( (int32 volatile *)p ); }
//inline int ThreadInterlockedExchange( int volatile *p, int value )	{ return ThreadInterlockedExchange( (int32 volatile *)p, value ); }
//inline int ThreadInterlockedExchangeAdd( int volatile *p, int value )	{ return ThreadInterlockedExchangeAdd( (int32 volatile *)p, value ); }
//inline int ThreadInterlockedCompareExchange( int volatile *p, int value, int comperand )	{ return ThreadInterlockedCompareExchange( (int32 volatile *)p, value, comperand ); }
//inline bool ThreadInterlockedAssignIf( int volatile *p, int value, int comperand )	{ return ThreadInterlockedAssignIf( (int32 volatile *)p, value, comperand ); }


#if defined( _WIN64 )
typedef __m128i int128;
inline int128 int128_zero()	{ return _mm_setzero_si128(); }
PLATFORM_INTERFACE bool ThreadInterlockedAssignIf128( volatile int128 *pDest, const int128 &value, const int128 &comperand ) NOINLINE;
#endif

//-----------------------------------------------------------------------------
// Access to VTune thread profiling
//-----------------------------------------------------------------------------
#if defined(_WIN32) && defined(THREAD_PROFILER)
PLATFORM_INTERFACE void ThreadNotifySyncPrepare(void *p);
PLATFORM_INTERFACE void ThreadNotifySyncCancel(void *p);
PLATFORM_INTERFACE void ThreadNotifySyncAcquired(void *p);
PLATFORM_INTERFACE void ThreadNotifySyncReleasing(void *p);
#else
#define ThreadNotifySyncPrepare(p)		((void)0)
#define ThreadNotifySyncCancel(p)		((void)0)
#define ThreadNotifySyncAcquired(p)		((void)0)
#define ThreadNotifySyncReleasing(p)	((void)0)
#endif

//-----------------------------------------------------------------------------
// Encapsulation of a thread local datum (needed because THREAD_LOCAL doesn't
// work in a DLL loaded with LoadLibrary()
//-----------------------------------------------------------------------------

#ifndef NO_THREAD_LOCAL

#if defined(WIN32) || defined(POSIX)
#ifndef __AFXTLS_H__ // not compatible with some Windows headers

#if defined(_PS3)
#define CTHREADLOCALINT CThreadLocalInt<int>
#define CTHREADLOCALINTEGER( typ ) CThreadLocalInt<typ>
#define CTHREADLOCALPTR( typ ) CThreadLocalPtr<typ>
#define CTHREADLOCAL( typ ) CThreadLocal<typ>
#define GETLOCAL( x ) ( x.Get() )
#else
#define CTHREADLOCALINT GenericThreadLocals::CThreadLocalInt<int>
#define CTHREADLOCALINTEGER( typ ) GenericThreadLocals::CThreadLocalInt<typ>
#define CTHREADLOCALPTR( typ ) GenericThreadLocals::CThreadLocalPtr<typ>
#define CTHREADLOCAL( typ ) GenericThreadLocals::CThreadLocal<typ>
#define GETLOCAL( x ) ( x.Get() )

#endif

#if !defined(_PS3)
namespace GenericThreadLocals
{
#endif
	// a (not so efficient) implementation of thread locals for compilers without full support (i.e. visual c).
	// don't use this explicity - instead, use the CTHREADxxx macros above.

	class PLATFORM_CLASS CThreadLocalBase
	{
public:
		CThreadLocalBase();
		~CThreadLocalBase();

		void * Get() const;
		void   Set(void *);

private:
#if defined(POSIX)   && !defined( _GAMECONSOLE )
		pthread_key_t m_index;
#else
		uint32 m_index;		
#endif
	};

	//---------------------------------------------------------

	template <class T>
	class CThreadLocal : public CThreadLocalBase
	{
	public:
		CThreadLocal()
		{
#ifdef PLATFORM_64BITS
			COMPILE_TIME_ASSERT( sizeof(T) <= sizeof(void *) );
#else
			COMPILE_TIME_ASSERT( sizeof(T) == sizeof(void *) );
#endif
		}

		void operator=( T i ) { Set( i ); }

		T Get() const
		{
#ifdef PLATFORM_64BITS
			void *pData = CThreadLocalBase::Get();
			return *reinterpret_cast<T*>( &pData );
#else
	#ifdef COMPILER_MSVC
		#pragma warning ( disable : 4311 )
	#endif
			return reinterpret_cast<T>( CThreadLocalBase::Get() );
	#ifdef COMPILER_MSVC
		#pragma warning ( default : 4311 )
	#endif
#endif
		}

		void Set(T val)
		{
#ifdef PLATFORM_64BITS
			void* pData = 0;
			*reinterpret_cast<T*>( &pData ) = val;
			CThreadLocalBase::Set( pData );
#else
	#ifdef COMPILER_MSVC
		#pragma warning ( disable : 4312 )
	#endif
			CThreadLocalBase::Set( reinterpret_cast<void *>(val) );
	#ifdef COMPILER_MSVC
		#pragma warning ( default : 4312 )
	#endif
#endif
		}
	};


	//---------------------------------------------------------

	template <class T = int32>
	class CThreadLocalInt : public CThreadLocal<T>
	{
	public:
		operator const T() const { return this->Get(); }
		int	operator=( T i ) { this->Set( i ); return i; }

		T operator++()					{ T i = this->Get(); this->Set( ++i ); return i; }
		T operator++(int)				{ T i = this->Get(); this->Set( i + 1 ); return i; }

		T operator--()					{ T i = this->Get(); this->Set( --i ); return i; }
		T operator--(int)				{ T i = this->Get(); this->Set( i - 1 ); return i; }

		inline CThreadLocalInt(  ) { }
		inline CThreadLocalInt( const T &initialvalue )
		{
			this->Set( initialvalue );
		}
	};


	//---------------------------------------------------------

	template <class T>
	class CThreadLocalPtr : private CThreadLocalBase
	{
	public:
		CThreadLocalPtr() = default;

		operator const void *() const          					{ return (const T *)Get(); }
		operator void *()                      					{ return (T *)Get(); }

		operator const T *() const							    { return (const T *)Get(); }
		operator const T *()          							{ return (const T *)Get(); }
		operator T *()											{ return (T *)Get(); }

		T *			operator=( T *p )							{ Set( p ); return p; }

		bool        operator !() const							{ return (!Get()); }
		bool        operator!=( int i ) const					{ AssertMsg( i == 0, "Only NULL allowed on integer compare" ); return (Get() != NULL); }
		bool        operator==( int i ) const					{ AssertMsg( i == 0, "Only NULL allowed on integer compare" ); return (Get() == NULL); }
		bool		operator==( const void *p ) const			{ return (Get() == p); }
		bool		operator!=( const void *p ) const			{ return (Get() != p); }
		bool		operator==( const T *p ) const				{ return operator==((const void*)p); }
		bool		operator!=( const T *p ) const				{ return operator!=((const void*)p); }

		T *  		operator->()								{ return (T *)Get(); }
		T &  		operator *()								{ return *((T *)Get()); }

		const T *   operator->() const							{ return (const T *)Get(); }
		const T &   operator *() const							{ return *((const T *)Get()); }

		const T &	operator[]( int i ) const					{ return *((const T *)Get() + i); }
		T &			operator[]( int i )							{ return *((T *)Get() + i); }

	private:
		// Disallowed operations
		CThreadLocalPtr( T *pFrom );
		CThreadLocalPtr( const CThreadLocalPtr<T> &from );
		T **operator &();
		T * const *operator &() const;
		void operator=( const CThreadLocalPtr<T> &from );
		bool operator==( const CThreadLocalPtr<T> &p ) const;
		bool operator!=( const CThreadLocalPtr<T> &p ) const;
	};
#if !defined(_PS3)
}
using namespace GenericThreadLocals;
#endif


#ifdef _OSX
PLATFORM_INTERFACE GenericThreadLocals::CThreadLocalInt<int> g_nThreadID;
#else // _OSX
#ifndef TIER0_DLL_EXPORT

#ifndef _PS3
DLL_GLOBAL_IMPORT CTHREADLOCALINT g_nThreadID;
#endif // !_PS3

#endif // TIER0_DLL_EXPORT
#endif // _OSX

#endif /// afx32
#endif //__win32

#endif // NO_THREAD_LOCAL

#ifdef _WIN64
// 64 bit windows can use intrinsics for these, 32-bit can't
#pragma intrinsic( _InterlockedCompareExchange64 )
#pragma intrinsic( _InterlockedExchange64 )
#pragma intrinsic( _InterlockedExchangeAdd64 ) 
inline int64 ThreadInterlockedIncrement64(int64 volatile *p)										{ AssertDbg((size_t)p % 8 == 0); return _InterlockedIncrement64((volatile int64*)p); }
inline int64 ThreadInterlockedDecrement64(int64 volatile *p)										{ AssertDbg((size_t)p % 8 == 0); return _InterlockedDecrement64((volatile int64*)p); }
#endif

//-----------------------------------------------------------------------------
//
// A super-fast thread-safe integer A simple class encapsulating the notion of an 
// atomic integer used across threads that uses the built in and faster 
// "interlocked" functionality rather than a full-blown mutex. Useful for simple 
// things like reference counts, etc.
//
//-----------------------------------------------------------------------------

template <typename T>
class CInterlockedIntT
{
public:
	CInterlockedIntT() : m_value( 0 ) 				{ COMPILE_TIME_ASSERT( ( sizeof(T) == sizeof(int32) ) || ( sizeof(T) == sizeof(int64) ) ); }

	CInterlockedIntT( T value ) : m_value( value ) 	{}

	T operator()( void ) const      { return m_value; }
	operator T() const				{ return m_value; }

	bool operator!() const			{ return ( m_value == 0 ); }
	bool operator==( T rhs ) const	{ return ( m_value == rhs ); }
	bool operator!=( T rhs ) const	{ return ( m_value != rhs ); }

	T operator++()					{
										if ( sizeof(T) == sizeof(int32) ) 
											return (T)ThreadInterlockedIncrement( (int32 *)&m_value );
										else
											return (T)ThreadInterlockedIncrement64( (int64 *)&m_value );
	}
	T operator++(int)				{ return operator++() - 1; }

	T operator--()					{	
										if ( sizeof(T) == sizeof(int32) )
											return (T)ThreadInterlockedDecrement( (int32 *)&m_value );
										else
											return (T)ThreadInterlockedDecrement64( (int64 *)&m_value );
									}

	T operator--(int)				{ return operator--() + 1; }

	bool AssignIf( T conditionValue, T newValue )	
									{ 
										if ( sizeof(T) == sizeof(int32) )
											return ThreadInterlockedAssignIf( (int32 *)&m_value, (int32)newValue, (int32)conditionValue );
										else
											return ThreadInterlockedAssignIf64( (int64 *)&m_value, (int64)newValue, (int64)conditionValue );
									}


	T operator=( T newValue )		{ 
										if ( sizeof(T) == sizeof(int32) )
											ThreadInterlockedExchange((int32 *)&m_value, newValue); 
										else
											ThreadInterlockedExchange64((int64 *)&m_value, newValue); 
										return m_value; 
									}

	// Atomic add is like += except it returns the previous value as its return value
	T AtomicAdd( T add )			{ 
										if ( sizeof(T) == sizeof(int32) )
											return (T)ThreadInterlockedExchangeAdd( (int32 *)&m_value, (int32)add );
										else
											return (T)ThreadInterlockedExchangeAdd64( (int64 *)&m_value, (int64)add );
									}


	void operator+=( T add )		{ 
										if ( sizeof(T) == sizeof(int32) )
											ThreadInterlockedExchangeAdd( (int32 *)&m_value, (int32)add );
										else
											ThreadInterlockedExchangeAdd64( (int64 *)&m_value, (int64)add );
									}

	void operator-=( T subtract )	{ operator+=( -subtract ); }
	void operator*=( T multiplier )	{ 
		T original, result; 
		do 
		{ 
			original = m_value; 
			result = original * multiplier; 
		} while ( !AssignIf( original, result ) );
	}
	void operator/=( T divisor )	{ 
		T original, result; 
		do 
		{ 
			original = m_value; 
			result = original / divisor;
		} while ( !AssignIf( original, result ) );
	}

	T operator+( T rhs ) const		{ return m_value + rhs; }
	T operator-( T rhs ) const		{ return m_value - rhs; }

	T InterlockedExchange(T newValue) {
		if (sizeof(T) == sizeof(int32))
			return (T)ThreadInterlockedExchange((int32*)&m_value, newValue);
		else
			return (T)ThreadInterlockedExchange64((int64*)&m_value, newValue);
	}

private:
	volatile T m_value;
};

typedef CInterlockedIntT<int> CInterlockedInt;
typedef CInterlockedIntT<unsigned> CInterlockedUInt;

//-----------------------------------------------------------------------------
#ifdef _M_X64
template <typename T>
class CInterlockedPtr
{
public:
	CInterlockedPtr() : m_value( 0 ) 				{}
	CInterlockedPtr( T *value ) : m_value( value ) 	{}

	operator T *() const			{ return m_value; }

	bool operator!() const			{ return ( m_value == 0 ); }
	bool operator==( T *rhs ) const	{ return ( m_value == rhs ); }
	bool operator!=( T *rhs ) const	{ return ( m_value != rhs ); }

	T *operator++()					{ return ((T *)_InterlockedExchangeAdd64( (volatile __int64 *)&m_value, sizeof(T) )) + 1; }
	T *operator++(int)				{ return (T *)_InterlockedExchangeAdd64( (volatile __int64 *)&m_value, sizeof(T) ); }

	T *operator--()					{ return ((T *)_InterlockedExchangeAdd64( (volatile __int64 *)&m_value, -sizeof(T) )) - 1; }
	T *operator--(int)				{ return (T *)_InterlockedExchangeAdd64( (volatile __int64 *)&m_value, -sizeof(T) ); }

	bool AssignIf( T *conditionValue, T *newValue )	{ return _InterlockedCompareExchangePointer( (void * volatile *)&m_value, newValue, conditionValue ) == conditionValue; }

	T *operator=( T *newValue )		{ _InterlockedExchangePointer( (void * volatile *) &m_value, newValue ); return newValue; }

	void operator+=( int add )		{ _InterlockedExchangeAdd64( (volatile __int64 *)&m_value, add * sizeof(T) ); }
	void operator-=( int subtract )	{ operator+=( -subtract ); }

	// Atomic add is like += except it returns the previous value as its return value
	T *AtomicAdd( int add ) { return ( T * )_InterlockedExchangeAdd64( (volatile __int64 *)&m_value, add * sizeof(T) ); }

	T *operator+( int rhs ) const		{ return m_value + rhs; }
	T *operator-( int rhs ) const		{ return m_value - rhs; }
	T *operator+( unsigned rhs ) const	{ return m_value + rhs; }
	T *operator-( unsigned rhs ) const	{ return m_value - rhs; }
	size_t operator-( T *p ) const		{ return m_value - p; }
	size_t operator-( const CInterlockedPtr<T> &p ) const	{ return m_value - p.m_value; }

private:
	T * volatile m_value;
};
#else
template <typename T>
class CInterlockedPtr
{
public:
	CInterlockedPtr() : m_value( 0 )
	{
#ifdef PLATFORM_64BITS 
		COMPILE_TIME_ASSERT( sizeof(T *) == sizeof(int64) );
#define THREADINTERLOCKEDEXCHANGEADD( _dest, _value ) 	ThreadInterlockedExchangeAdd64( (int64 *)(_dest), _value )
#else  // PLATFORM_64BITS
		COMPILE_TIME_ASSERT( sizeof(T *) == sizeof(int32) );
#define THREADINTERLOCKEDEXCHANGEADD( _dest, _value )	ThreadInterlockedExchangeAdd( (int32 *)_dest, _value )
#endif // PLATFORM_64BITS
	}

	CInterlockedPtr( T *value ) : m_value( value ) 	{}

	operator T *() const			{ return m_value; }

	bool operator!() const			{ return ( m_value == 0 ); }
	bool operator==( T *rhs ) const	{ return ( m_value == rhs ); }
	bool operator!=( T *rhs ) const	{ return ( m_value != rhs ); }

	T *operator++()					{ return ((T *)THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, sizeof(T) )) + 1; }
	T *operator++(int)				{ return (T *)THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, sizeof(T) ); }

	T *operator--()					{ return ((T *)THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, -sizeof(T) )) - 1; }
	T *operator--(int)				{ return (T *)THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, -sizeof(T) ); }

	bool AssignIf( T *conditionValue, T *newValue )	{ return ThreadInterlockedAssignPointerToConstIf( (void const **) &m_value, (void const *) newValue, (void const *) conditionValue ); }

	T *operator=( T *newValue )		{ ThreadInterlockedExchangePointerToConst( (void const **) &m_value, (void const *) newValue ); return newValue; }

	void operator+=( int add )		{ THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, add * sizeof(T) ); }
	void operator-=( int subtract )	{ operator+=( -subtract ); }

	// Atomic add is like += except it returns the previous value as its return value
	T *AtomicAdd( int add ) { return ( T * ) THREADINTERLOCKEDEXCHANGEADD( (int32 *)&m_value, add * sizeof(T) ); }

	T *operator+( int rhs ) const		{ return m_value + rhs; }
	T *operator-( int rhs ) const		{ return m_value - rhs; }
	T *operator+( unsigned rhs ) const	{ return m_value + rhs; }
	T *operator-( unsigned rhs ) const	{ return m_value - rhs; }
	size_t operator-( T *p ) const		{ return m_value - p; }
	size_t operator-( const CInterlockedPtr<T> &p ) const	{ return m_value - p.m_value; }

private:
	T * volatile m_value;

#undef THREADINTERLOCKEDEXCHANGEADD
};
#endif


//-----------------------------------------------------------------------------
//
// Platform independent for critical sections management
//
//-----------------------------------------------------------------------------

class PLATFORM_CLASS CThreadMutex
{
public:
	CThreadMutex();
	~CThreadMutex();

	//------------------------------------------------------
	// Mutex acquisition/release. Const intentionally defeated.
	//------------------------------------------------------
	void Lock();
	void Lock() const		{ (const_cast<CThreadMutex *>(this))->Lock(); }
	void Unlock();
	void Unlock() const		{ (const_cast<CThreadMutex *>(this))->Unlock(); }

	bool TryLock();
	bool TryLock() const	{ return (const_cast<CThreadMutex *>(this))->TryLock(); }

	void LockSilent(); // A Lock() operation which never spews.  Required by the logging system to prevent badness.
	void UnlockSilent(); // An Unlock() operation which never spews.  Required by the logging system to prevent badness.

	//------------------------------------------------------
	// Use this to make deadlocks easier to track by asserting
	// when it is expected that the current thread owns the mutex
	//------------------------------------------------------
	bool AssertOwnedByCurrentThread();

	//------------------------------------------------------
	// On windows with THREAD_MUTEX_TRACING_ENABLED defined, this returns
	// true if the mutex is owned by the current thread.
	//------------------------------------------------------
	bool IsOwnedByCurrentThread_DebugOnly();

	//------------------------------------------------------
	// Enable tracing to track deadlock problems
	//------------------------------------------------------
	void SetTrace( bool );

private:
	// Disallow copying
	CThreadMutex( const CThreadMutex & );
	CThreadMutex &operator=( const CThreadMutex & );

#if defined( _WIN32 )
	// Efficient solution to breaking the windows.h dependency, invariant is tested.
#ifdef _WIN64
	#define TT_SIZEOF_CRITICALSECTION 40	
#else
#ifndef _X360
	#define TT_SIZEOF_CRITICALSECTION 24
#else
	#define TT_SIZEOF_CRITICALSECTION 28
#endif // !_X360
#endif // _WIN64
	byte m_CriticalSection[TT_SIZEOF_CRITICALSECTION];
#elif defined( _PS3 )
	sys_mutex_t m_Mutex;
#elif defined(POSIX)
	pthread_mutex_t m_Mutex;
	pthread_mutexattr_t m_Attr;
#else
#error
#endif

#ifdef THREAD_MUTEX_TRACING_SUPPORTED
	// Debugging (always herge to allow mixed debug/release builds w/o changing size)
	uint	m_currentOwnerID;
	uint16	m_lockCount;
	bool	m_bTrace;
#endif
};

//-----------------------------------------------------------------------------
//
// An alternative mutex that is useful for cases when thread contention is 
// rare, but a mutex is required. Instances should be declared volatile.
// Sleep of 0 may not be sufficient to keep high priority threads from starving 
// lesser threads. This class is not a suitable replacement for a critical
// section if the resource contention is high.
//
//-----------------------------------------------------------------------------

#if !defined(THREAD_PROFILER)

class CThreadFastMutex
{
public:
	CThreadFastMutex()
	  :	m_ownerID( 0 ),
	  	m_depth( 0 )
	{
	}

private:
	FORCEINLINE bool TryLockInline( const uint32 threadId ) volatile
	{
		if ( threadId != m_ownerID && !ThreadInterlockedAssignIf( (volatile int32 *)&m_ownerID, (int32)threadId, 0 ) )
			return false;

		ThreadMemoryBarrier();
		++m_depth;
		return true;
	}

	bool TryLock( const uint32 threadId ) volatile
	{
		return TryLockInline( threadId );
	}

	PLATFORM_CLASS void Lock( const uint32 threadId, unsigned nSpinSleepTime ) volatile;

public:
	bool TryLock() volatile
	{
#ifdef _DEBUG
		if ( m_depth == INT_MAX )
			DebuggerBreak();

		if ( m_depth < 0 )
			DebuggerBreak();
#endif
		return TryLockInline( ThreadGetCurrentId() );
	}

#ifndef _DEBUG 
	FORCEINLINE 
#endif
	void Lock( unsigned int nSpinSleepTime = 0 ) volatile
	{
		const uint32 threadId = ThreadGetCurrentId();

		if ( !TryLockInline( threadId ) )
		{
			ThreadPause();
			Lock( threadId, nSpinSleepTime );
		}
#ifdef _DEBUG
		if ( m_ownerID != (int32)ThreadGetCurrentId() )
			DebuggerBreak();

		if ( m_depth == INT_MAX )
			DebuggerBreak();

		if ( m_depth < 0 )
			DebuggerBreak();
#endif
	}

#ifndef _DEBUG
	FORCEINLINE 
#endif
	void Unlock() volatile
	{
#ifdef _DEBUG
		if ( m_ownerID != (int32)ThreadGetCurrentId() )
			DebuggerBreak();

		if ( m_depth <= 0 )
			DebuggerBreak();
#endif

		--m_depth;
		if ( !m_depth )
		{
			ThreadMemoryBarrier();
			ThreadInterlockedExchange( &m_ownerID, 0 );
		}
	}

	bool TryLock() const volatile							{ return (const_cast<CThreadFastMutex *>(this))->TryLock(); }
	void Lock(unsigned nSpinSleepTime = 0 ) const volatile	{ (const_cast<CThreadFastMutex *>(this))->Lock( nSpinSleepTime ); }
	void Unlock() const	volatile							{ (const_cast<CThreadFastMutex *>(this))->Unlock(); }

	// To match regular CThreadMutex:
	bool AssertOwnedByCurrentThread()	{ return true; }
	void SetTrace( bool )				{}

	uint32 GetOwnerId() const			{ return m_ownerID;	}
	int	GetDepth() const				{ return m_depth; }
private:
	volatile uint32 m_ownerID;
	int				m_depth;
};

class ALIGN128 CAlignedThreadFastMutex : public CThreadFastMutex
{
public:
	CAlignedThreadFastMutex()
	{
		Assert( (size_t)this % 128 == 0 && sizeof(*this) == 128 );
	}

private:
	uint8 pad[128-sizeof(CThreadFastMutex)];
};

#else
#ifdef _PS3

class CThreadFastMutex
{
public:
	CThreadFastMutex();
	~CThreadFastMutex();

	//------------------------------------------------------
	// Mutex acquisition/release. Const intentionally defeated.
	//------------------------------------------------------
	void Lock();
	void Lock() const		{ (const_cast<CThreadFastMutex *>(this))->Lock(); }
	void Unlock();
	void Unlock() const		{ (const_cast<CThreadFastMutex *>(this))->Unlock(); }

	bool TryLock();
	bool TryLock() const	{ return (const_cast<CThreadFastMutex *>(this))->TryLock(); }

	//------------------------------------------------------
	// Use this to make deadlocks easier to track by asserting
	// when it is expected that the current thread owns the mutex
	//------------------------------------------------------
	bool AssertOwnedByCurrentThread();

	//------------------------------------------------------
	// Enable tracing to track deadlock problems
	//------------------------------------------------------
	void SetTrace( bool );

private:
	// Disallow copying
	CThreadFastMutex( const CThreadFastMutex & );
	//CThreadFastMutex &operator=( const CThreadFastMutex & );
	sys_lwmutex_t m_Mutex;
        sys_mutex_t m_SlowMutex;
};

#else

typedef CThreadMutex CThreadFastMutex;

#endif

class ALIGN128 CAlignedThreadFastMutex : public CThreadFastMutex
{
public:
	CAlignedThreadFastMutex()
	{
		Assert( (size_t)this % 128 == 0 && sizeof(*this) == 128 );
	}

private:
	uint8 pad[128-sizeof(CThreadFastMutex)];
};

#endif

//-----------------------------------------------------------------------------
//
//-----------------------------------------------------------------------------

class CThreadNullMutex
{
public:
	static void Lock()				{}
	static void Unlock()			{}

	static bool TryLock()			{ return true; }
	static bool AssertOwnedByCurrentThread() { return true; }
	static void SetTrace( bool b )	{}

	static uint32 GetOwnerId() 		{ return 0;	}
	static int	GetDepth() 			{ return 0; }
};

//-----------------------------------------------------------------------------
//
// A mutex decorator class used to control the use of a mutex, to make it
// less expensive when not multithreading
//
//-----------------------------------------------------------------------------

template <class BaseClass, bool *pCondition>
class CThreadConditionalMutex : public BaseClass
{
public:
	void Lock()				{ if ( *pCondition ) BaseClass::Lock(); }
	void Lock() const 		{ if ( *pCondition ) BaseClass::Lock(); }
	void Unlock()			{ if ( *pCondition ) BaseClass::Unlock(); }
	void Unlock() const		{ if ( *pCondition ) BaseClass::Unlock(); }

	bool TryLock()			{ if ( *pCondition ) return BaseClass::TryLock(); else return true; }
	bool TryLock() const 	{ if ( *pCondition ) return BaseClass::TryLock(); else return true; }
	bool AssertOwnedByCurrentThread() { if ( *pCondition ) return BaseClass::AssertOwnedByCurrentThread(); else return true; }
	void SetTrace( bool b ) { if ( *pCondition ) BaseClass::SetTrace( b ); }
};

//-----------------------------------------------------------------------------
// Mutex decorator that blows up if another thread enters
//-----------------------------------------------------------------------------

template <class BaseClass>
class CThreadTerminalMutex : public BaseClass
{
public:
	bool TryLock()			{ if ( !BaseClass::TryLock() ) { DebuggerBreak(); return false; } return true; }
	bool TryLock() const 	{ if ( !BaseClass::TryLock() ) { DebuggerBreak(); return false; } return true; }
	void Lock()				{ if ( !TryLock() ) BaseClass::Lock(); }
	void Lock() const 		{ if ( !TryLock() ) BaseClass::Lock(); }

};

//-----------------------------------------------------------------------------
//
// Class to Lock a critical section, and unlock it automatically
// when the lock goes out of scope
//
//-----------------------------------------------------------------------------

template <class MUTEX_TYPE = CThreadMutex>
class CAutoLockT
{
public:
	FORCEINLINE CAutoLockT( MUTEX_TYPE &lock)
		: m_lock(lock)
	{
		m_lock.Lock();
	}

	FORCEINLINE CAutoLockT(const MUTEX_TYPE &lock)
		: m_lock(const_cast<MUTEX_TYPE &>(lock))
	{
		m_lock.Lock();
	}

	FORCEINLINE ~CAutoLockT()
	{
		m_lock.Unlock();
	}


private:
	MUTEX_TYPE &m_lock;

	// Disallow copying
	CAutoLockT<MUTEX_TYPE>( const CAutoLockT<MUTEX_TYPE> & );
	CAutoLockT<MUTEX_TYPE> &operator=( const CAutoLockT<MUTEX_TYPE> & );
};

typedef CAutoLockT<CThreadMutex> CAutoLock;

//---------------------------------------------------------

template <int size>	struct CAutoLockTypeDeducer {};
template <> struct CAutoLockTypeDeducer<sizeof(CThreadMutex)> {	typedef CThreadMutex Type_t; };
template <> struct CAutoLockTypeDeducer<sizeof(CThreadNullMutex)> {	typedef CThreadNullMutex Type_t; };
#if !defined(THREAD_PROFILER)
template <> struct CAutoLockTypeDeducer<sizeof(CThreadFastMutex)> {	typedef CThreadFastMutex Type_t; };
template <> struct CAutoLockTypeDeducer<sizeof(CAlignedThreadFastMutex)> {	typedef CAlignedThreadFastMutex Type_t; };
#else
template <> struct CAutoLockTypeDeducer<sizeof(CAlignedThreadFastMutex)> {	typedef CAlignedThreadFastMutex Type_t; };
#endif


#define AUTO_LOCK_( type, mutex ) \
	CAutoLockT< type > UNIQUE_ID( static_cast<const type &>( mutex ) )

#if defined(GNUC)

template<typename T> T strip_cv_quals_for_mutex(T&);
template<typename T> T strip_cv_quals_for_mutex(const T&);
template<typename T> T strip_cv_quals_for_mutex(volatile T&);
template<typename T> T strip_cv_quals_for_mutex(const volatile T&);

#define AUTO_LOCK( mutex ) \
	AUTO_LOCK_( decltype(::strip_cv_quals_for_mutex(mutex)), mutex )

#elif defined( __clang__ )
#define AUTO_LOCK( mutex ) \
	AUTO_LOCK_( typename CAutoLockTypeDeducer<sizeof(mutex)>::Type_t, mutex )
#else
#define AUTO_LOCK( mutex ) \
	AUTO_LOCK_( CAutoLockTypeDeducer<sizeof(mutex)>::Type_t, mutex )
#endif


#define AUTO_LOCK_FM( mutex ) \
	AUTO_LOCK_( CThreadFastMutex, mutex )

#define LOCAL_THREAD_LOCK_( tag ) \
	; \
	static CThreadFastMutex autoMutex_##tag; \
	AUTO_LOCK( autoMutex_##tag )

#define LOCAL_THREAD_LOCK() \
	LOCAL_THREAD_LOCK_(_)

//-----------------------------------------------------------------------------
//
// Base class for event, semaphore and mutex objects.
//
//-----------------------------------------------------------------------------

// TW_TIMEOUT must match WAIT_TIMEOUT definition
#define TW_TIMEOUT	0x00000102
// TW_FAILED must match WAIT_FAILED definition
#define TW_FAILED	0xFFFFFFFF

class PLATFORM_CLASS CThreadSyncObject
{
public:
	~CThreadSyncObject();

	//-----------------------------------------------------
	// Query if object is useful
	//-----------------------------------------------------
	bool operator!() const;

	//-----------------------------------------------------
	// Access handle
	//-----------------------------------------------------
#ifdef _WIN32
	operator HANDLE() { return GetHandle(); }
	const HANDLE GetHandle() const { return m_hSyncObject; }
#endif
	//-----------------------------------------------------
	// Wait for a signal from the object
	//-----------------------------------------------------
	bool Wait( uint32 dwTimeout = TT_INFINITE );

	//-----------------------------------------------------
	// Wait for a signal from any of the specified objects.
	//
	// Returns the index of the object that signaled the event
	// or THREADSYNC_TIMEOUT if the timeout was hit before the wait condition was met.
	//
	// Returns TW_FAILED if an incoming object is invalid.
	//
	// If bWaitAll=true, then it'll return 0 if all the objects were set.
	//-----------------------------------------------------
	static uint32 WaitForMultiple( int nObjects, CThreadSyncObject **ppObjects, bool bWaitAll, uint32 dwTimeout = TT_INFINITE );
	
	// This builds a list of pointers and calls straight through to the other WaitForMultiple.
	static uint32 WaitForMultiple( int nObjects, CThreadSyncObject *ppObjects, bool bWaitAll, uint32 dwTimeout = TT_INFINITE );

protected:
	CThreadSyncObject();
	void AssertUseable();

#ifdef _WIN32
	HANDLE m_hSyncObject;
	bool m_bCreatedHandle;
#elif defined( _PS3 )
	static sys_lwmutex_t	m_staticMutex;
	static uint32_t			m_bstaticMutexInitialized;
	static uint32_t			m_bstaticMutexInitializing;
#elif defined(POSIX)
	pthread_mutex_t	m_Mutex;
	pthread_cond_t	m_Condition;
	bool m_bInitalized;
	int m_cSet;
	bool m_bManualReset;
	bool m_bWakeForEvent;
#else
#error "Implement me"
#endif

private:
	CThreadSyncObject( const CThreadSyncObject & );
	CThreadSyncObject &operator=( const CThreadSyncObject & );
};


//-----------------------------------------------------------------------------
//
// Wrapper for unnamed event objects
//
//-----------------------------------------------------------------------------


//-----------------------------------------------------------------------------
//
// CThreadSemaphore
//
//-----------------------------------------------------------------------------

class PLATFORM_CLASS CThreadSemaphore : public CThreadSyncObject
{
public:
	CThreadSemaphore(int32 initialValue, int32 maxValue);

	//-----------------------------------------------------
	// Increases the count of the semaphore object by a specified
	// amount.  Wait() decreases the count by one on return.
	//-----------------------------------------------------
	bool Release(int32 releaseCount = 1, int32 * pPreviousCount = NULL );
	bool Wait( uint32 dwTimeout = TT_INFINITE );

private:
	CThreadSemaphore(const CThreadSemaphore &);
	CThreadSemaphore &operator=(const CThreadSemaphore &);
#ifdef _PS3
	bool AddWaitingThread();
	void RemoveWaitingThread();
	sys_semaphore_t			m_Semaphore;
	sys_semaphore_value_t	m_sema_max_val;
	uint32_t				m_numWaitingThread;
	uint32_t				m_bInitalized;
	uint32_t						m_semaCount;
#endif
};

#if defined( _WIN32 )

//-----------------------------------------------------------------------------
//
// A mutex suitable for out-of-process, multi-processor usage
//
//-----------------------------------------------------------------------------

class PLATFORM_CLASS CThreadFullMutex : public CThreadSyncObject
{
public:
	CThreadFullMutex( bool bEstablishInitialOwnership = false, const char * pszName = NULL );

	//-----------------------------------------------------
	// Release ownership of the mutex
	//-----------------------------------------------------
	bool Release();

	// To match regular CThreadMutex:
	void Lock()							{ Wait(); }
	void Lock( unsigned timeout )		{ Wait( timeout ); }
	void Unlock()						{ Release(); }
	bool AssertOwnedByCurrentThread()	{ return true; }
	void SetTrace( bool )				{}

private:
	CThreadFullMutex( const CThreadFullMutex & );
	CThreadFullMutex &operator=( const CThreadFullMutex & );
};
#endif

enum NamedEventResult_t
{
	TT_EventDoesntExist	= 0,
	TT_EventNotSignaled,
	TT_EventSignaled
};
#if defined( _PS3 )
//---------------------------------------------------------------------------
// CThreadEventWaitObject - the purpose of this class is to help implement
// WaitForMultipleObejcts on PS3. 
//
// Each event maintains a linked list of CThreadEventWaitObjects. When a 
// thread wants to wait on an event it passes the event a semaphore that 
// ptr to see the index of the event that triggered it
//
// The thread-specific mutex is to ensure that setting the index and setting the
// semaphore are atomic
//---------------------------------------------------------------------------

class CThreadEventWaitObject
{
public:
	CThreadEventWaitObject *m_pPrev, *m_pNext;
	sys_semaphore_t			*m_pSemaphore;
	int						m_index;
	int						*m_pFlag;

	CThreadEventWaitObject() {}

	void Init(sys_semaphore_t *pSem, int index, int *pFlag)
	{
		m_pSemaphore = pSem;
		m_index = index;
		m_pFlag = pFlag;
	}

	void Set();
};
#endif //_PS3

class PLATFORM_CLASS CThreadEvent : public CThreadSyncObject
{
public:
	CThreadEvent( bool fManualReset = false );
#ifdef PLATFORM_WINDOWS
	CThreadEvent( const char *name, bool initialState = false, bool bManualReset = false );
	static NamedEventResult_t CheckNamedEvent( const char *name, uint32 dwTimeout = 0 );

	CThreadEvent( HANDLE hHandle );
#endif
	//-----------------------------------------------------
	// Set the state to signaled
	//-----------------------------------------------------
	bool Set();

	//-----------------------------------------------------
	// Set the state to nonsignaled
	//-----------------------------------------------------
	bool Reset();

	//-----------------------------------------------------
	// Check if the event is signaled
	//-----------------------------------------------------
	bool Check(); // Please, use for debugging only!

	bool Wait( uint32 dwTimeout = TT_INFINITE );

	// See CThreadSyncObject for definitions of these functions.
	static uint32 WaitForMultiple( int nObjects, CThreadEvent **ppObjects, bool bWaitAll, uint32 dwTimeout = TT_INFINITE );
	// To implement these, I need to check that casts are safe
	static uint32 WaitForMultiple( int nObjects, CThreadEvent *ppObjects, bool bWaitAll, uint32 dwTimeout = TT_INFINITE );

#ifdef _PS3
	void RegisterWaitingThread(sys_semaphore_t *pSemaphore, int index, int *flag);
	void UnregisterWaitingThread(sys_semaphore_t *pSemaphore);
#endif

protected:
#ifdef _PS3
	// These virtual functions need to be inline in order for the class to be exported from tier0.prx
	virtual bool AddWaitingThread()
	{
		//This checks if the event is already signaled and if not creates a semaphore which will be signaled 
		//when the event is finally signaled.
		bool result;

		sys_lwmutex_lock(&m_staticMutex, 0);

		if (m_bSet)
			result=false;
		else
		{
			result=true;

			m_numWaitingThread++;

			if ( m_numWaitingThread == 1 )
			{		
				sys_semaphore_attribute_t semAttr;
				sys_semaphore_attribute_initialize( semAttr );
				int err = sys_semaphore_create( &m_Semaphore, &semAttr, 0, 256 );
				Assert( err == CELL_OK );
				m_bInitalized = true;
			}
		}

		sys_lwmutex_unlock(&m_staticMutex);
		return result;
	}

	virtual void RemoveWaitingThread()
	{
		sys_lwmutex_lock(&m_staticMutex, 0);

		m_numWaitingThread--;

		if ( m_numWaitingThread == 0)
		{		
			int err = sys_semaphore_destroy( m_Semaphore );
			Assert( err == CELL_OK );
			m_bInitalized = false;
		}

		sys_lwmutex_unlock(&m_staticMutex);
	}
#endif
private:
	CThreadEvent( const CThreadEvent & );
	CThreadEvent &operator=( const CThreadEvent & );
#if defined( _PS3 )
	uint32_t				m_bSet;
	bool					m_bManualReset;

	sys_semaphore_t			m_Semaphore;
	uint32_t				m_numWaitingThread;
	uint32_t				m_bInitalized;

	CThreadEventWaitObject	m_waitObjects[CTHREADEVENT_MAX_WAITING_THREADS+2];	
	CThreadEventWaitObject	*m_pWaitObjectsPool;
	CThreadEventWaitObject	*m_pWaitObjectsList;
	
	CThreadEventWaitObject* LLUnlinkNode(CThreadEventWaitObject *node);
	CThreadEventWaitObject* LLLinkNode(CThreadEventWaitObject* list, CThreadEventWaitObject *node);

#endif
};

// Hard-wired manual event for use in array declarations
class CThreadManualEvent : public CThreadEvent
{
public:
	CThreadManualEvent()
	 :	CThreadEvent( true )
	{
	}
};

#ifdef _WIN32
PLATFORM_INTERFACE int ThreadWaitForObjects( int nEvents, const HANDLE *pHandles, bool bWaitAll = true, unsigned timeout = TT_INFINITE );
inline int ThreadWaitForEvents( int nEvents, const CThreadEvent *pEvents, bool bWaitAll = true, unsigned timeout = TT_INFINITE ) { return ThreadWaitForObjects( nEvents, (const HANDLE *)pEvents, bWaitAll, timeout ); }
inline int ThreadWaitForObject(HANDLE handle, bool bWaitAll = true, unsigned timeout = TT_INFINITE) { return ThreadWaitForObjects(1, &handle, bWaitAll, timeout); }
#endif

//-----------------------------------------------------------------------------
//
// CThreadRWLock
//
//-----------------------------------------------------------------------------

class PLATFORM_CLASS CThreadRWLock
{
public:
	CThreadRWLock();

	void LockForRead();
	void UnlockRead();
	void LockForWrite();
	void UnlockWrite();

	void LockForRead() const { const_cast<CThreadRWLock *>(this)->LockForRead(); }
	void UnlockRead() const { const_cast<CThreadRWLock *>(this)->UnlockRead(); }
	void LockForWrite() const { const_cast<CThreadRWLock *>(this)->LockForWrite(); }
	void UnlockWrite() const { const_cast<CThreadRWLock *>(this)->UnlockWrite(); }

private:
	void WaitForRead();

#ifdef WIN32
	CThreadFastMutex m_mutex;
#else
	CThreadMutex m_mutex;	
#endif
	CThreadEvent m_CanWrite;
	CThreadEvent m_CanRead;

	int m_nWriters;
	int m_nActiveReaders;
	int m_nPendingReaders;
};

//-----------------------------------------------------------------------------
//
// CThreadSpinRWLock
//
//-----------------------------------------------------------------------------

#ifndef OLD_SPINRWLOCK
class ALIGN8 PLATFORM_CLASS CThreadSpinRWLock
{
public:
	CThreadSpinRWLock()
	{ 
		m_lockInfo.m_i32 = 0;
		m_writerId = 0;
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
		m_iWriteDepth = 0;
#endif
	}

	bool IsLockedForWrite();
	bool IsLockedForRead();

	FORCEINLINE bool TryLockForWrite();
	bool TryLockForWrite_UnforcedInline();

	void LockForWrite();
	void SpinLockForWrite();

	FORCEINLINE bool TryLockForRead();
	bool TryLockForRead_UnforcedInline();

	void LockForRead();
	void SpinLockForRead();

	void UnlockWrite();
	void UnlockRead();

	bool TryLockForWrite() const { return const_cast<CThreadSpinRWLock *>(this)->TryLockForWrite(); }
	bool TryLockForRead() const { return const_cast<CThreadSpinRWLock *>(this)->TryLockForRead(); }
	void LockForRead() const { const_cast<CThreadSpinRWLock *>(this)->LockForRead(); }
	void UnlockRead() const { const_cast<CThreadSpinRWLock *>(this)->UnlockRead(); }
	void LockForWrite() const { const_cast<CThreadSpinRWLock *>(this)->LockForWrite(); }
	void UnlockWrite() const { const_cast<CThreadSpinRWLock *>(this)->UnlockWrite(); }

private:
	enum
	{
		THREAD_SPIN = (8*1024)
	};

	union LockInfo_t
	{
		struct
		{
#if PLAT_LITTLE_ENDIAN
			uint16 m_nReaders;
			uint16 m_fWriting;
#else
			uint16 m_fWriting;
			uint16 m_nReaders;
#endif
		};
		uint32 m_i32;
	};

	LockInfo_t	m_lockInfo;
	ThreadId_t		m_writerId;
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	int			m_iWriteDepth;
	uint32		pad;
#endif
} ALIGN8_POST;

#else

/* (commented out to reduce distraction in colorized editor, remove entirely when new implementation settles)
class ALIGN8 PLATFORM_CLASS CThreadSpinRWLock
{
public:
	CThreadSpinRWLock()	{ COMPILE_TIME_ASSERT( sizeof( LockInfo_t ) == sizeof( int64 ) ); Assert( (intp)this % 8 == 0 ); memset( this, 0, sizeof( *this ) ); }

	bool TryLockForWrite();
	bool TryLockForRead();

	void LockForRead();
	void UnlockRead();
	void LockForWrite();
	void UnlockWrite();

	bool TryLockForWrite() const { return const_cast<CThreadSpinRWLock *>(this)->TryLockForWrite(); }
	bool TryLockForRead() const { return const_cast<CThreadSpinRWLock *>(this)->TryLockForRead(); }
	void LockForRead() const { const_cast<CThreadSpinRWLock *>(this)->LockForRead(); }
	void UnlockRead() const { const_cast<CThreadSpinRWLock *>(this)->UnlockRead(); }
	void LockForWrite() const { const_cast<CThreadSpinRWLock *>(this)->LockForWrite(); }
	void UnlockWrite() const { const_cast<CThreadSpinRWLock *>(this)->UnlockWrite(); }

private:
	// This structure is used as an atomic & exchangeable 64-bit value. It would probably be better to just have one 64-bit value
	// and accessor functions that make/break it, but at this late stage of development, I'm just wrapping it into union
	// Beware of endianness: on Xbox/PowerPC m_writerId is high-word of m_i64; on PC, it's low-dword of m_i64
	union LockInfo_t
	{
		struct
		{
			uint32	m_writerId;
			int		m_nReaders;
		};
		int64 m_i64;
	};

	bool AssignIf( const LockInfo_t &newValue, const LockInfo_t &comperand );
	bool TryLockForWrite( const uint32 threadId );
	void SpinLockForWrite( const uint32 threadId );

	volatile LockInfo_t m_lockInfo;
	CInterlockedInt m_nWriters;
} ALIGN8_POST;
*/
#endif

//-----------------------------------------------------------------------------
//
// A thread wrapper similar to a Java thread.
//
//-----------------------------------------------------------------------------
#ifdef _PS3
// Everything must be inline for this to work across PRX boundaries

class CThread;
PLATFORM_INTERFACE CThread *GetCurThreadPS3();
PLATFORM_INTERFACE void SetCurThreadPS3( CThread * );
PLATFORM_INTERFACE void AllocateThreadID( void );
PLATFORM_INTERFACE void FreeThreadID( void );
#endif

class PLATFORM_CLASS CThread
{
public:
	CThread();
	virtual ~CThread();

	//-----------------------------------------------------

	const char *GetName();
	void SetName( const char *pszName );

	size_t CalcStackDepth( void *pStackVariable )		{ return ((byte *)m_pStackBase - (byte *)pStackVariable); }

	//-----------------------------------------------------
	// Functions for the other threads
	//-----------------------------------------------------

	// Start thread running  - error if already running
	virtual bool Start( unsigned nBytesStack = 0, ThreadPriorityEnum_t nPriority = TP_PRIORITY_DEFAULT );

	// Returns true if thread has been created and hasn't yet exited
	bool IsAlive();

	// This method causes the current thread to wait until this thread
	// is no longer alive.
	bool Join( unsigned timeout = TT_INFINITE );

	// Access the thread handle directly
	ThreadHandle_t GetThreadHandle();

#ifdef _WIN32
	uint GetThreadId();
#endif

	//-----------------------------------------------------

	int GetResult();

	//-----------------------------------------------------
	// Functions for both this, and maybe, and other threads
	//-----------------------------------------------------

	// Forcibly, abnormally, but relatively cleanly stop the thread
	void Stop( int exitCode = 0 );

	// Get the priority
	int GetPriority() const;

	// Set the priority
	bool SetPriority( int priority );

	// Suspend a thread, can only call from the thread itself
	unsigned Suspend();

	// Resume a suspended thread
	unsigned Resume();

	// Check if thread is suspended
	bool IsSuspended()	{ return !m_NotSuspendedEvent.Check(); }

	// Force hard-termination of thread.  Used for critical failures.
	bool Terminate( int exitCode = 0 );

	//-----------------------------------------------------
	// Global methods
	//-----------------------------------------------------

	// Get the Thread object that represents the current thread, if any.
	// Can return NULL if the current thread was not created using
	// CThread
	static CThread *GetCurrentCThread();

	// Offer a context switch. Under Win32, equivalent to Sleep(0)
#ifdef Yield
#undef Yield
#endif
	static void Yield();

	// This method causes the current thread to yield and not to be
	// scheduled for further execution until a certain amount of real
	// time has elapsed, more or less. Duration is in milliseconds
	static void Sleep( unsigned duration );

protected:

	// Optional pre-run call, with ability to fail-create. Note Init()
	// is forced synchronous with Start()
	virtual bool Init();

	// Thread will run this function on startup, must be supplied by
	// derived class, performs the intended action of the thread.
	virtual int Run() = 0;

	// Called when the thread exits
	virtual void OnExit();

	// Allow for custom start waiting
	virtual bool WaitForCreateComplete( CThreadEvent *pEvent );
	const ThreadId_t GetThreadID() const { return (ThreadId_t)m_threadId; }

#ifdef PLATFORM_WINDOWS
	const ThreadHandle_t GetThreadHandle() const { return (ThreadHandle_t)m_hThread; }

	static unsigned long __stdcall ThreadProc( void * pv );
	typedef unsigned long (__stdcall *ThreadProc_t)( void * );
#else
	static void* ThreadProc( void * pv );
	typedef void* (*ThreadProc_t)( void * pv );
#endif
	static void ThreadProcRunWithMinidumpHandler( void *pv );

	virtual ThreadProc_t GetThreadProc();
	virtual bool IsThreadRunning();

	CThreadMutex m_Lock;
	CThreadEvent m_ExitEvent;	// Set right before the thread's function exits.

private:
	enum Flags
	{
		SUPPORT_STOP_PROTOCOL = 1 << 0
	};

	// Thread initially runs this. param is actually 'this'. function
	// just gets this and calls ThreadProc
	struct ThreadInit_t
	{
		CThread *     pThread;
		CThreadEvent *pInitCompleteEvent;
		bool *        pfInitSuccess;
#if defined( THREAD_PARENT_STACK_TRACE_ENABLED )
		void *        ParentStackTrace[THREAD_PARENT_STACK_TRACE_LENGTH];
#endif
	};

	// make copy constructor and assignment operator inaccessible
	CThread( const CThread & );
	CThread &operator=( const CThread & );

#ifdef _WIN32
	HANDLE 	m_hThread;
	ThreadId_t m_threadId;
#elif defined( _PS3 )
	sys_ppu_thread_t	m_threadId;
	volatile sys_ppu_thread_t	m_threadZombieId;

	// Mutex and condition variable used by the Suspend / Resume logic
	sys_mutex_t			m_mutexSuspend;
	sys_cond_t			m_condSuspend;

	//EAPS3 Event to indicate that a thread has terminated. This helps with the replacing of WaitForMultipleObjects
	//      on the PS3, since it waits for a thread to finish.
	CThreadEvent		m_threadEnd;
#elif defined(POSIX)
	pthread_t m_threadId;
	volatile pthread_t	m_threadZombieId;
	//lwss add - Thread params. These were previously allocated on the heap and leaked.
    ThreadInit_t m_threadInit;
    //lwss end
#endif
	int		m_result;
	char	m_szName[32];
	void *	m_pStackBase;
	unsigned m_flags;
	CThreadManualEvent m_NotSuspendedEvent;
};

// The CThread implementation needs to be inlined for performance on the PS3 - It makes a difference of more than 1ms/frame
// Since the dependency checker isn't smart enough to take an #ifdef _PS3 into account, all platforms will inline it.
#ifdef _PS3
#include "threadtools.inl"
#endif

//-----------------------------------------------------------------------------
//
// A helper class to let you sleep a thread for memory validation, you need to handle
//	 m_bSleepForValidate in your ::Run() call and set m_bSleepingForValidate when sleeping
//
//-----------------------------------------------------------------------------
class PLATFORM_CLASS CValidatableThread : public CThread
{
public:
	CValidatableThread()
	{
		m_bSleepForValidate = false;
		m_bSleepingForValidate = false;
	}

#ifdef DBGFLAG_VALIDATE
	virtual void SleepForValidate() { m_bSleepForValidate = true; }
	bool BSleepingForValidate() { return m_bSleepingForValidate; }
	virtual void WakeFromValidate() { m_bSleepForValidate = false; }
#endif
protected:
	bool m_bSleepForValidate;
	bool m_bSleepingForValidate;
};

//-----------------------------------------------------------------------------
// Simple thread class encompasses the notion of a worker thread, handing
// synchronized communication.
//-----------------------------------------------------------------------------

// These are internal reserved error results from a call attempt
enum WTCallResult_t
{
	WTCR_FAIL			= -1,
	WTCR_TIMEOUT		= -2,
	WTCR_THREAD_GONE	= -3,
};

class PLATFORM_CLASS CWorkerThread : public CThread
{
public:
	CWorkerThread();

	//-----------------------------------------------------
	//
	// Inter-thread communication
	//
	// Calls in either direction take place on the same "channel."
	// Seperate functions are specified to make identities obvious
	//
	//-----------------------------------------------------

	// Master: Signal the thread, and block for a response
	int CallWorker( unsigned, unsigned timeout = TT_INFINITE, bool fBoostWorkerPriorityToMaster = true );

	// Worker: Signal the thread, and block for a response
	int CallMaster( unsigned, unsigned timeout = TT_INFINITE );

	// Wait for the next request
	bool WaitForCall( unsigned dwTimeout, unsigned *pResult = NULL );
	bool WaitForCall( unsigned *pResult = NULL );

	// Is there a request?
	bool PeekCall( unsigned *pParam = NULL );

	// Reply to the request
	void Reply( unsigned );

	// Wait for a reply in the case when CallWorker() with timeout != TT_INFINITE
	int WaitForReply( unsigned timeout = TT_INFINITE );

	// If you want to do WaitForMultipleObjects you'll need to include
	// this handle in your wait list or you won't be responsive
	CThreadEvent& GetCallHandle();	// (returns m_EventSend)

	// Find out what the request was
	unsigned GetCallParam() const;

	// Boost the worker thread to the master thread, if worker thread is lesser, return old priority
	int BoostPriority();

protected:
	typedef uint32 (        *WaitFunc_t)( uint32 nHandles, CThreadEvent** ppHandles, int bWaitAll, uint32 timeout );
	int Call( unsigned, unsigned timeout, bool fBoost, WaitFunc_t = NULL );
	int WaitForReply( unsigned timeout, WaitFunc_t );

private:
	CWorkerThread( const CWorkerThread & );
	CWorkerThread &operator=( const CWorkerThread & );

	CThreadEvent	m_EventSend;
	CThreadEvent	m_EventComplete;

	unsigned        m_Param;
	int				m_ReturnVal;
};


// a unidirectional message queue. A queue of type T. Not especially high speed since each message
// is malloced/freed. Note that if your message class has destructors/constructors, they MUST be
// thread safe!
template<class T> class CMessageQueue
{
	CThreadEvent SignalEvent;								// signals presence of data
	CThreadMutex QueueAccessMutex;

	// the parts protected by the mutex
	struct MsgNode
	{
		MsgNode *Next;
		T Data;
	};

	MsgNode *Head;
	MsgNode *Tail;

public:
	CMessageQueue( void )
	{
		Head = Tail = NULL;
	}

	// check for a message. not 100% reliable - someone could grab the message first
	bool MessageWaiting( void ) 
	{
		return ( Head != NULL );
	}

	void WaitMessage( T *pMsg )
	{
		for(;;)
		{
			while( ! MessageWaiting() )
				SignalEvent.Wait();
			QueueAccessMutex.Lock();
			if (! Head )
			{
				// multiple readers could make this null
				QueueAccessMutex.Unlock();
				continue;
			}
			*( pMsg ) = Head->Data;
			MsgNode *remove_this = Head;
			Head = Head->Next;
			if (! Head)										// if empty, fix tail ptr
				Tail = NULL;
			QueueAccessMutex.Unlock();
			delete remove_this;
			break;
		}
	}

	void QueueMessage( T const &Msg)
	{
		MsgNode *new1=new MsgNode;
		new1->Data=Msg;
		new1->Next=NULL;
		QueueAccessMutex.Lock();
		if ( Tail )
		{
			Tail->Next=new1;
			Tail = new1;
		}
		else
		{
			Head = new1;
			Tail = new1;
		}
		SignalEvent.Set();
		QueueAccessMutex.Unlock();
	}
};


//-----------------------------------------------------------------------------
//
// CThreadMutex. Inlining to reduce overhead and to allow client code
// to decide debug status (tracing)
//
//-----------------------------------------------------------------------------

#ifdef MSVC
typedef struct _RTL_CRITICAL_SECTION RTL_CRITICAL_SECTION;
typedef RTL_CRITICAL_SECTION CRITICAL_SECTION;

#ifndef _X360
extern "C"
{
	void __declspec(dllimport) __stdcall InitializeCriticalSection(CRITICAL_SECTION *);
	void __declspec(dllimport) __stdcall EnterCriticalSection(CRITICAL_SECTION *);
	void __declspec(dllimport) __stdcall LeaveCriticalSection(CRITICAL_SECTION *);
	void __declspec(dllimport) __stdcall DeleteCriticalSection(CRITICAL_SECTION *);
};
#endif
#endif

//---------------------------------------------------------
#if !defined(POSIX) || defined( _GAMECONSOLE )

inline void CThreadMutex::Lock()
{
#if defined(_PS3)
	#ifndef NO_THREAD_SYNC
		sys_mutex_lock( m_Mutex, 0 );
	#endif
#else
	#if defined( THREAD_MUTEX_TRACING_ENABLED )
		uint thisThreadID = ThreadGetCurrentId();
		if ( m_bTrace && m_currentOwnerID && ( m_currentOwnerID != thisThreadID ) )
			Msg( _T( "Thread %u about to wait for lock %p owned by %u\n" ), ThreadGetCurrentId(), (CRITICAL_SECTION *)&m_CriticalSection, m_currentOwnerID );
	#endif

		LockSilent();

	#ifdef THREAD_MUTEX_TRACING_ENABLED
		if (m_lockCount == 0)
		{
			// we now own it for the first time.  Set owner information
			m_currentOwnerID = thisThreadID;
			if ( m_bTrace )
				Msg( _T( "Thread %u now owns lock 0x%p\n" ), m_currentOwnerID, (CRITICAL_SECTION *)&m_CriticalSection );
		}
		m_lockCount++;
	#endif
#endif
}

//---------------------------------------------------------

inline void CThreadMutex::Unlock()
{
#if defined( _PS3 )

	#ifndef NO_THREAD_SYNC
		sys_mutex_unlock( m_Mutex );
	#endif

#else
	#ifdef THREAD_MUTEX_TRACING_ENABLED
		AssertMsg( m_lockCount >= 1, "Invalid unlock of thread lock" );
		m_lockCount--;
		if (m_lockCount == 0)
		{
			if ( m_bTrace )
				Msg( _T( "Thread %u releasing lock 0x%p\n" ), m_currentOwnerID, (CRITICAL_SECTION *)&m_CriticalSection );
			m_currentOwnerID = 0;
		}
	#endif
	UnlockSilent();
#endif
}

//---------------------------------------------------------

inline void CThreadMutex::LockSilent()
{
	#ifdef MSVC
	EnterCriticalSection((CRITICAL_SECTION *)&m_CriticalSection);
	#else
	DebuggerBreak();	// should not be called - not defined for this platform/compiler!!!
	#endif
}

//---------------------------------------------------------

inline void CThreadMutex::UnlockSilent()
{
	#ifdef MSVC
	LeaveCriticalSection((CRITICAL_SECTION *)&m_CriticalSection);
	#else
	DebuggerBreak();	// should not be called - not defined for this platform/compiler!!!
	#endif
}

//---------------------------------------------------------

inline bool CThreadMutex::AssertOwnedByCurrentThread()
{
#ifdef THREAD_MUTEX_TRACING_ENABLED
#ifdef _WIN32
	if (ThreadGetCurrentId() == m_currentOwnerID)
		return true;
	AssertMsg3( 0, "Expected thread %u as owner of lock 0x%p, but %u owns", ThreadGetCurrentId(), (CRITICAL_SECTION *)&m_CriticalSection, m_currentOwnerID );
	return false;
#elif defined( _PS3 )
		return true;
#endif
#else
	return true;
#endif
}

inline bool CThreadMutex::IsOwnedByCurrentThread_DebugOnly()
{
#if defined ( THREAD_MUTEX_TRACING_ENABLED ) && defined ( _WIN32 )
	return ThreadGetCurrentId() == m_currentOwnerID;
#else
	return true;
#endif
}

//---------------------------------------------------------

inline void CThreadMutex::SetTrace( bool bTrace )
{
#ifdef _WIN32
#ifdef THREAD_MUTEX_TRACING_ENABLED
	m_bTrace = bTrace;
#endif
#elif defined _PS3
	//EAPS3
#endif

}

//---------------------------------------------------------

#elif defined(POSIX) && !defined( _GAMECONSOLE )

inline CThreadMutex::CThreadMutex()
{
	// enable recursive locks as we need them
	pthread_mutexattr_init( &m_Attr );
	pthread_mutexattr_settype( &m_Attr, PTHREAD_MUTEX_RECURSIVE );
	pthread_mutex_init( &m_Mutex, &m_Attr );
}

//---------------------------------------------------------

inline CThreadMutex::~CThreadMutex()
{
	pthread_mutex_destroy( &m_Mutex );
}

//---------------------------------------------------------

inline void CThreadMutex::Lock()
{
	pthread_mutex_lock( &m_Mutex );
}

//---------------------------------------------------------

inline void CThreadMutex::Unlock()
{
	pthread_mutex_unlock( &m_Mutex );
}

//---------------------------------------------------------

inline void CThreadMutex::LockSilent()
{
	pthread_mutex_lock( &m_Mutex );
}

//---------------------------------------------------------

inline void CThreadMutex::UnlockSilent()
{
	pthread_mutex_unlock( &m_Mutex );
}

//---------------------------------------------------------

inline bool CThreadMutex::AssertOwnedByCurrentThread()
{
	return true;
}

//---------------------------------------------------------

inline void CThreadMutex::SetTrace(bool fTrace)
{
}

#else 
#error
#endif // POSIX

//-----------------------------------------------------------------------------
//
// CThreadRWLock inline functions
//
//-----------------------------------------------------------------------------

inline CThreadRWLock::CThreadRWLock()
:	m_CanRead( true ),
	m_nWriters( 0 ),
	m_nActiveReaders( 0 ),
	m_nPendingReaders( 0 )
{
}

inline void CThreadRWLock::LockForRead()
{
	m_mutex.Lock();
	if ( m_nWriters)
	{
		WaitForRead();
	}
	m_nActiveReaders++;
	m_mutex.Unlock();
}

inline void CThreadRWLock::UnlockRead()
{
	m_mutex.Lock();
	m_nActiveReaders--;
	if ( m_nActiveReaders == 0 && m_nWriters != 0 )
	{
		m_CanWrite.Set();
	}
	m_mutex.Unlock();
}


//-----------------------------------------------------------------------------
//
// CThreadSpinRWLock inline functions
//
//-----------------------------------------------------------------------------

#ifndef OLD_SPINRWLOCK

#if defined(TEST_THREAD_SPIN_RW_LOCK)
#define RWLAssert( exp ) if ( exp ) ; else DebuggerBreak();
#else
#define RWLAssert( exp ) ((void)0)
#endif

inline bool CThreadSpinRWLock::IsLockedForWrite()
{
	return ( m_lockInfo.m_fWriting == 1 );
}

inline bool CThreadSpinRWLock::IsLockedForRead()
{
	return ( m_lockInfo.m_nReaders > 0 );
}

FORCEINLINE bool CThreadSpinRWLock::TryLockForWrite()
{
	volatile LockInfo_t &curValue = m_lockInfo;
	if ( !( curValue.m_i32 & 0x00010000 ) && ThreadInterlockedAssignIf( &curValue.m_i32, 0x00010000, 0  ) ) 
	{
		ThreadMemoryBarrier();
		RWLAssert( m_iWriteDepth == 0 && m_writerId == 0 );
		m_writerId = ThreadGetCurrentId();
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
		m_iWriteDepth++;
#endif
		return true;
	}

	return false;
}

inline bool CThreadSpinRWLock::TryLockForWrite_UnforcedInline()
{
	if ( TryLockForWrite() )
	{
		return true;
	}

#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	if ( m_writerId != ThreadGetCurrentId() )
	{
		return false;
	}
	m_iWriteDepth++;
	return true;
#else
	return false;
#endif
}

FORCEINLINE void CThreadSpinRWLock::LockForWrite()
{
	if ( !TryLockForWrite() )
	{
		SpinLockForWrite();
	}
}

FORCEINLINE bool CThreadSpinRWLock::TryLockForRead()
{
	volatile LockInfo_t &curValue = m_lockInfo;
	if ( !( curValue.m_i32 & 0x00010000 ) ) // !m_lockInfo.m_fWriting
	{
		LockInfo_t oldValue; 
		LockInfo_t newValue;
		oldValue.m_i32 = ( curValue.m_i32 & 0xffff );
		newValue.m_i32 = oldValue.m_i32 + 1;

		if ( ThreadInterlockedAssignIf( &m_lockInfo.m_i32, newValue.m_i32, oldValue.m_i32 ) )
		{
			ThreadMemoryBarrier();
			RWLAssert( m_lockInfo.m_fWriting == 0 );
			return true;
		}
	}
	return false;
}

inline bool CThreadSpinRWLock::TryLockForRead_UnforcedInline()
{
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	if ( m_lockInfo.m_i32 & 0x00010000 ) // m_lockInfo.m_fWriting
	{
		if ( m_writerId == ThreadGetCurrentId() )
		{
			m_lockInfo.m_nReaders++;
			return true;
		}

		return false;
	}
#endif
	return TryLockForRead();
}

FORCEINLINE void CThreadSpinRWLock::LockForRead()
{
	if ( !TryLockForRead() )
	{
		SpinLockForRead();
	}
}

FORCEINLINE void CThreadSpinRWLock::UnlockWrite()
{
	RWLAssert( m_writerId == ThreadGetCurrentId() );
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	if ( --m_iWriteDepth == 0 )
#endif
	{
		m_writerId = 0;
		ThreadMemoryBarrier();
		m_lockInfo.m_i32 = 0;
	}
}

#ifndef REENTRANT_THREAD_SPIN_RW_LOCK
FORCEINLINE
#else
inline
#endif
void CThreadSpinRWLock::UnlockRead()
{
	RWLAssert( m_writerId == 0 || ( m_writerId == ThreadGetCurrentId() && m_lockInfo.m_fWriting ) );
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	if ( !( m_lockInfo.m_i32 & 0x00010000 ) ) // !m_lockInfo.m_fWriting
#endif
	{
		ThreadMemoryBarrier();
		ThreadInterlockedDecrement( &m_lockInfo.m_i32 );
		RWLAssert( m_writerId == 0 && !m_lockInfo.m_fWriting );
	}
#ifdef REENTRANT_THREAD_SPIN_RW_LOCK
	else if ( m_writerId == ThreadGetCurrentId() )
	{
		m_lockInfo.m_nReaders--;
	}
	else
	{
		RWLAssert( 0 );
	}
#endif
}

#else
/* (commented out to reduce distraction in colorized editor, remove entirely when new implementation settles)
inline bool CThreadSpinRWLock::AssignIf( const LockInfo_t &newValue, const LockInfo_t &comperand )
{
	// Note: using unions guarantees no aliasing bugs. Casting structures through *(int64*)& 
	//       may create hard-to-catch bugs because when you do that, compiler doesn't know that the newly computed pointer
	//       is actually aliased with LockInfo_t structure. It's rarely a problem in practice, but when it is, it's a royal pain to debug.
	return ThreadInterlockedAssignIf64( &m_lockInfo.m_i64, newValue.m_i64, comperand.m_i64 );
}

FORCEINLINE bool CThreadSpinRWLock::TryLockForWrite( const uint32 threadId )
{
	// In order to grab a write lock, there can be no readers and no owners of the write lock
	if ( m_lockInfo.m_nReaders > 0 || ( m_lockInfo.m_writerId && m_lockInfo.m_writerId != threadId ) )
	{
		return false;
	}

	static const LockInfo_t oldValue = { {0, 0} };
	LockInfo_t newValue = { { threadId, 0 } };
	if ( AssignIf( newValue, oldValue ) )
	{
		ThreadMemoryBarrier();
		return true;
	}
	return false;
}

inline bool CThreadSpinRWLock::TryLockForWrite()
{
	m_nWriters++;
	if ( !TryLockForWrite( ThreadGetCurrentId() ) )
	{
		m_nWriters--;
		return false;
	}
	return true;
}

FORCEINLINE bool CThreadSpinRWLock::TryLockForRead()
{
	if ( m_nWriters != 0 )
	{
		return false;
	}
	// In order to grab a write lock, the number of readers must not change and no thread can own the write
	LockInfo_t oldValue;
	LockInfo_t newValue;

	if( IsX360() || IsPS3() )
	{
		// this is the code equivalent to original code (see below) that doesn't cause LHS on Xbox360
		// WARNING: This code assumes BIG Endian CPU
		oldValue.m_i64 = uint32( m_lockInfo.m_nReaders );
		newValue.m_i64 = oldValue.m_i64 + 1; // NOTE: when we have -1 (or 0xFFFFFFFF) readers, this will result in non-equivalent code
	}
	else
	{
		// this is the original code that worked here for a while
		oldValue.m_nReaders = m_lockInfo.m_nReaders;
		oldValue.m_writerId = 0;
		newValue.m_nReaders = oldValue.m_nReaders + 1;
		newValue.m_writerId = 0;
	}

	if ( AssignIf( newValue, oldValue ) )
	{
		ThreadMemoryBarrier();
		return true;
	}
	return false;
}

inline void CThreadSpinRWLock::LockForWrite()
{
	const uint32 threadId = ThreadGetCurrentId();

	m_nWriters++;

	if ( !TryLockForWrite( threadId ) )
	{
		ThreadPause();
		SpinLockForWrite( threadId );
	}
}
*/
#endif

// read data from a memory address
template<class T> FORCEINLINE T ReadVolatileMemory( T const *pPtr )
{
	volatile const T * pVolatilePtr = ( volatile const T * ) pPtr;
	return *pVolatilePtr;
}


//-----------------------------------------------------------------------------

#if defined( _WIN32 )
#pragma warning(pop)
#endif

#if defined( _PS3 )
BOOL SetEvent( CThreadEvent *pEvent );
BOOL ResetEvent( CThreadEvent *pEvent );
DWORD WaitForMultipleObjects(DWORD nCount, CThreadEvent **lppHandles, BOOL bWaitAll, DWORD dwMilliseconds );
#endif // _PS3
#endif // THREADTOOLS_H
