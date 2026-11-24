package com.divelogtransfer.app

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import java.io.ByteArrayOutputStream
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/** Writes only generated QR images; no permission to read the user's photos is needed. */
class QrGalleryModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val executor = Executors.newSingleThreadExecutor()
    override fun getName() = "QrGallery"

    @ReactMethod
    fun savePng(base64: String, name: String, caption: String, promise: Promise) {
        executor.execute {
            try {
                require(name.matches(Regex("ssi-dive-[A-Za-z0-9._-]+\\.png"))) { "Invalid QR image filename" }
                val source = Base64.decode(base64, Base64.DEFAULT)
                require(source.size >= 8 && source[0] == 137.toByte() && source[1] == 80.toByte()) { "Invalid PNG image" }
                val qr = requireNotNull(BitmapFactory.decodeByteArray(source, 0, source.size)) { "Invalid PNG image" }
                val padding = 32
                val paint = TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 24f }
                val text = StaticLayout.Builder.obtain(caption, 0, caption.length, paint, qr.width - padding * 2)
                    .setAlignment(Layout.Alignment.ALIGN_CENTER).setLineSpacing(8f, 1f).build()
                val image = Bitmap.createBitmap(qr.width, qr.height + text.height + padding * 2, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(image)
                canvas.drawColor(Color.WHITE)
                canvas.drawBitmap(qr, 0f, 0f, null)
                canvas.save()
                canvas.translate(padding.toFloat(), (qr.height + padding).toFloat())
                text.draw(canvas)
                canvas.restore()
                val bytes = ByteArrayOutputStream().use { stream -> image.compress(Bitmap.CompressFormat.PNG, 100, stream); stream.toByteArray() }
                qr.recycle()
                image.recycle()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = context.contentResolver
                    val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    val relativePath = "${Environment.DIRECTORY_PICTURES}/Dive Log Transfer/"
                    var uri: android.net.Uri? = null
                    resolver.query(collection, arrayOf(MediaStore.Images.Media._ID),
                        "${MediaStore.Images.Media.DISPLAY_NAME} = ? AND ${MediaStore.Images.Media.RELATIVE_PATH} = ?",
                        arrayOf(name, relativePath), null)?.use { cursor ->
                        if (cursor.moveToFirst()) uri = ContentUris.withAppendedId(collection, cursor.getLong(0))
                    }
                    val created = uri == null
                    if (created) {
                        val values = ContentValues().apply {
                            put(MediaStore.Images.Media.DISPLAY_NAME, name)
                            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                            put(MediaStore.Images.Media.RELATIVE_PATH, relativePath)
                            put(MediaStore.Images.Media.IS_PENDING, 1)
                        }
                        uri = resolver.insert(collection, values) ?: error("Gallery could not create an image")
                    }
                    val target = requireNotNull(uri)
                    try {
                        val stream = resolver.openOutputStream(target, "wt") ?: error("Gallery image is not writable")
                        stream.use { it.write(bytes) }
                        resolver.update(target, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
                        promise.resolve(target.toString())
                    } catch (error: Exception) {
                        if (created) resolver.delete(target, null, null)
                        throw error
                    }
                } else {
                    if (context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        error("Allow saving images to storage")
                    }
                    @Suppress("DEPRECATION")
                    val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Dive Log Transfer")
                    check(directory.isDirectory || directory.mkdirs()) { "Could not create the QR image folder" }
                    val file = File(directory, name)
                    FileOutputStream(file).use { it.write(bytes) }
                    MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/png")) { _, scannedUri ->
                        if (scannedUri == null) promise.reject("E_GALLERY_INDEX", "Image saved but gallery indexing failed. Retry this image.")
                        else promise.resolve(scannedUri.toString())
                    }
                }
            } catch (error: Exception) {
                promise.reject("E_QR_GALLERY", error.message ?: "Could not save QR image", error)
            }
        }
    }

    override fun invalidate() { executor.shutdown(); super.invalidate() }
}
