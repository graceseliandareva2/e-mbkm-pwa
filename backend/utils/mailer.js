const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

const sendEmail = async ({ to, subject, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'e-MBKM ITBSS <onboarding@resend.dev>',
      to,
      subject,
      html,
    })

    if (error) {
      console.error(`❌ Gagal kirim email ke ${to}:`, error.message)
      return { success: false, error: error.message }
    }

    console.log(`✅ Email terkirim ke ${to} (id: ${data.id})`)
    return { success: true }
  } catch (err) {
    console.error(`❌ Gagal kirim email ke ${to}:`, err.message)
    return { success: false, error: err.message }
  }
}

module.exports = { sendEmail }