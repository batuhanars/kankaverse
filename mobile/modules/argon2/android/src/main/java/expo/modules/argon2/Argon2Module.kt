package expo.modules.argon2

import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * E5a yedek anahtari turetimi icin native Argon2id. Saf JS (noble) Redmi 14C'de ~20 sn surdu; bu modul
 * 64 MiB / t4'te ~0,8 sn. AsyncFunction ana is parcacigi disinda calisir. Cikti HAM hash (encoded degil),
 * boylece noble ile bayt bayt ayni sonuc verir (uyum vektorleri e2ee-core testlerinde).
 * Sifre/tuz/parametre NFC, UTF-8 ve taban denetimi JS tarafinda (e2ee-core) yapilir; burada yalniz hesap var.
 */
class Argon2Module : Module() {
  private val argon2 by lazy { Argon2Kt() }

  override fun definition() = ModuleDefinition {
    Name("Argon2")

    AsyncFunction("argon2id") { password: ByteArray, salt: ByteArray, m: Int, t: Int, p: Int, dkLen: Int ->
      val result = argon2.hash(
        mode = Argon2Mode.ARGON2_ID,
        password = password,
        salt = salt,
        tCostInIterations = t,
        mCostInKibibyte = m,
        parallelism = p,
        hashLengthInBytes = dkLen,
      )
      result.rawHashAsByteArray()
    }
  }
}
