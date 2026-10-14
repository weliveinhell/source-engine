#!/usr/bin/env python3
"""Inject Render360's browser-backed read-only file into filesystem_stdio.cpp.

The repository keeps the upstream Source file readable.  For Wasm builds the
filesystem wscript calls this idempotent patch before compilation.  The bridge
bypasses Emscripten's legacy JS filesystem for retail Portal files: Source's
pthread reads File/Blob ranges synchronously through FileReaderSync instead of
copying VPK archives into MEMFS.
"""

from pathlib import Path

path = Path(__file__).with_name("filesystem_stdio.cpp")
text = path.read_text()
marker = "Render360 browser-backed retail file"
if marker in text:
    print("Render360 Portal: browser-backed filesystem patch already applied")
    raise SystemExit(0)

anchor = """ASSERT_INVARIANT( SEEK_END == FILESYSTEM_SEEK_TAIL );\n\n//-----------------------------------------------------------------------------\n"""
insert = """ASSERT_INVARIANT( SEEK_END == FILESYSTEM_SEEK_TAIL );\n\n#ifdef __EMSCRIPTEN__\nextern \"C\" int render360_browser_file_open( const char *path );\nextern \"C\" double render360_browser_file_size( int handle );\nextern \"C\" int render360_browser_file_read( int handle, double offset, void *dest, int length );\nextern \"C\" void render360_browser_file_close( int handle );\nextern \"C\" double render360_browser_file_stat( const char *path );\n#endif\n\n//-----------------------------------------------------------------------------\n"""
if anchor not in text:
    raise SystemExit("Render360 Portal: stdio declaration anchor moved")
text = text.replace(anchor, insert, 1)

anchor = """\tFILE *m_pFile;\n\tbool m_bWriteable;\n};\n\n#ifdef POSIX\n"""
insert = """\tFILE *m_pFile;\n\tbool m_bWriteable;\n};\n\n#ifdef __EMSCRIPTEN__\n// Render360 browser-backed retail file.  This object deliberately implements\n// only read operations.  VPK bytes stay in the user's browser File objects;\n// each read copies only the requested range into the caller's Wasm buffer.\nclass CRender360BrowserFile : public CStdFilesystemFile\n{\npublic:\n\tstatic bool CanOpen( const char *filename, const char *options );\n\tstatic CRender360BrowserFile *FS_fopen( const char *filename, const char *options, int64 *size );\n\n\tvirtual void FS_setbufsize( unsigned nBytes ) {}\n\tvirtual void FS_fclose();\n\tvirtual void FS_fseek( int64 pos, int seekType );\n\tvirtual long FS_ftell();\n\tvirtual int FS_feof();\n\tvirtual size_t FS_fread( void *dest, size_t destSize, size_t size );\n\tvirtual size_t FS_fwrite( const void *src, size_t size ) { return 0; }\n\tvirtual bool FS_setmode( FileMode_t mode ) { return true; }\n\tvirtual size_t FS_vfprintf( const char *fmt, va_list list ) { return 0; }\n\tvirtual int FS_ferror() { return m_bError ? 1 : 0; }\n\tvirtual int FS_fflush() { return 0; }\n\tvirtual char *FS_fgets( char *dest, int destSize );\n\nprivate:\n\tCRender360BrowserFile( int handle, int64 fileSize )\n\t\t: m_nHandle( handle ), m_nSize( fileSize ), m_nPosition( 0 ), m_bError( false ) {}\n\n\tint m_nHandle;\n\tint64 m_nSize;\n\tint64 m_nPosition;\n\tbool m_bError;\n};\n#endif\n\n#ifdef POSIX\n"""
if anchor not in text:
    raise SystemExit("Render360 Portal: CStdioFile class anchor moved")
text = text.replace(anchor, insert, 1)

anchor = """\tCBaseFileSystem::FixUpPath ( filenameT, filename, sizeof( filename ) );\n\n#ifdef _WIN32\n"""
insert = """\tCBaseFileSystem::FixUpPath ( filenameT, filename, sizeof( filename ) );\n\n#ifdef __EMSCRIPTEN__\n\tif ( CRender360BrowserFile::CanOpen( filename, options ) )\n\t{\n\t\tpFile = CRender360BrowserFile::FS_fopen( filename, options, size );\n\t\tif ( pFile )\n\t\t\treturn (FILE *)pFile;\n\t}\n#endif\n\n#ifdef _WIN32\n"""
if anchor not in text:
    raise SystemExit("Render360 Portal: FS_fopen anchor moved")
text = text.replace(anchor, insert, 1)

anchor = """\tCBaseFileSystem::FixUpPath ( pathT, path, sizeof( path ) );\n\n\tint rt = _stat( path, buf );\n"""
insert = """\tCBaseFileSystem::FixUpPath ( pathT, path, sizeof( path ) );\n\n#ifdef __EMSCRIPTEN__\n\tconst double render360Size = render360_browser_file_stat( path );\n\tif ( render360Size >= 0.0 )\n\t{\n\t\tmemset( buf, 0, sizeof( *buf ) );\n\t\tbuf->st_mode = S_IFREG | S_IRUSR | S_IRGRP | S_IROTH;\n\t\tbuf->st_nlink = 1;\n\t\tbuf->st_size = (int64)render360Size;\n\t\treturn 0;\n\t}\n#endif\n\n\tint rt = _stat( path, buf );\n"""
if anchor not in text:
    raise SystemExit("Render360 Portal: FS_stat anchor moved")
text = text.replace(anchor, insert, 1)

anchor = """//-----------------------------------------------------------------------------\n// Purpose: low-level filesystem wrapper\n//-----------------------------------------------------------------------------\nCStdioFile *CStdioFile::FS_fopen( const char *filenameT, const char *options, int64 *size )\n"""
implementation = r'''#ifdef __EMSCRIPTEN__
bool CRender360BrowserFile::CanOpen( const char *filename, const char *options )
{
	if ( !filename || !options )
		return false;
	if ( strchr( options, 'w' ) || strchr( options, 'a' ) || strchr( options, '+' ) )
		return false;
	return render360_browser_file_stat( filename ) >= 0.0;
}

CRender360BrowserFile *CRender360BrowserFile::FS_fopen( const char *filename, const char *options, int64 *size )
{
	if ( !CanOpen( filename, options ) )
		return NULL;
	const int handle = render360_browser_file_open( filename );
	if ( handle < 0 )
		return NULL;
	const double fileSize = render360_browser_file_size( handle );
	if ( fileSize < 0.0 )
	{
		render360_browser_file_close( handle );
		return NULL;
	}
	const int64 nFileSize = (int64)fileSize;
	if ( size )
		*size = nFileSize;
	return new CRender360BrowserFile( handle, nFileSize );
}

void CRender360BrowserFile::FS_fclose()
{
	if ( m_nHandle >= 0 )
		render360_browser_file_close( m_nHandle );
	m_nHandle = -1;
}

void CRender360BrowserFile::FS_fseek( int64 pos, int seekType )
{
	int64 next = pos;
	if ( seekType == SEEK_CUR )
		next = m_nPosition + pos;
	else if ( seekType == SEEK_END )
		next = m_nSize + pos;
	if ( next < 0 )
		next = 0;
	m_nPosition = next;
}

long CRender360BrowserFile::FS_ftell()
{
	return (long)m_nPosition;
}

int CRender360BrowserFile::FS_feof()
{
	return m_nPosition >= m_nSize;
}

size_t CRender360BrowserFile::FS_fread( void *dest, size_t destSize, size_t size )
{
	if ( !dest || !size || m_nHandle < 0 || m_nPosition >= m_nSize )
		return 0;

	const int64 available = m_nSize - m_nPosition;
	size_t wanted = size;
	if ( (int64)wanted > available )
		wanted = (size_t)available;

	// Keep temporary FileReaderSync ArrayBuffers small on iPhone.  Only this
	// transient chunk is copied into the Wasm heap; the VPK itself stays outside.
	const size_t kReadChunk = 2 * 1024 * 1024;
	size_t total = 0;
	byte *out = reinterpret_cast<byte *>( dest );
	while ( total < wanted )
	{
		const size_t remain = wanted - total;
		const int request = (int)( remain > kReadChunk ? kReadChunk : remain );
		const int got = render360_browser_file_read( m_nHandle, (double)m_nPosition, out + total, request );
		if ( got <= 0 )
		{
			if ( got < 0 ) m_bError = true;
			break;
		}
		m_nPosition += got;
		total += (size_t)got;
		if ( got < request ) break;
	}
	return total;
}

char *CRender360BrowserFile::FS_fgets( char *dest, int destSize )
{
	if ( !dest || destSize <= 1 || FS_feof() )
		return NULL;
	int written = 0;
	while ( written < destSize - 1 && !FS_feof() )
	{
		char c = 0;
		if ( FS_fread( &c, 1, 1 ) != 1 ) break;
		dest[written++] = c;
		if ( c == '\n' ) break;
	}
	if ( !written ) return NULL;
	dest[written] = '\0';
	return dest;
}
#endif

//-----------------------------------------------------------------------------
// Purpose: low-level filesystem wrapper
//-----------------------------------------------------------------------------
CStdioFile *CStdioFile::FS_fopen( const char *filenameT, const char *options, int64 *size )
'''
if anchor not in text:
    raise SystemExit("Render360 Portal: CStdioFile implementation anchor moved")
text = text.replace(anchor, implementation, 1)

for required in (
    marker,
    "render360_browser_file_open",
    "CRender360BrowserFile::FS_fread",
    "render360_browser_file_stat( path )",
    "kReadChunk = 2 * 1024 * 1024",
):
    if required not in text:
        raise SystemExit(f"Render360 Portal: generated stdio patch missing {required}")

path.write_text(text)
print("Render360 Portal: patched filesystem_stdio for browser-backed retail File reads")
