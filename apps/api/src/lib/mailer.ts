import nodemailer, { type Transporter } from "nodemailer";

/**
 * 邮件发送封装。
 *
 * 没配 SMTP 时不抛错，只把邮件内容打印到控制台 ——
 * 这样本地开发不用先申请邮箱授权码，也能把注册 / 找回密码流程跑通。
 */
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465)
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM

/** 是否配齐了 SMTP，路由层用它决定要不要把验证码回传给前端 */
export const isMailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            // 465 是 SSL 直连；587 是 STARTTLS，nodemailer 会自动升级
            secure: SMTP_PORT === 465,
            auth: { user: SMTP_USER as string, pass: SMTP_PASS as string },
        })
    }
    return transporter
}

export async function sendMail(options: {
    to: string;
    subject: string;
    html: string;
}): Promise<void> {
    if (!isMailConfigured) {
        const plain = options.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log('\n[mailer] 未配置 SMTP，邮件未真正发送：');
        console.log(`  收件人：${options.to}`);
        console.log(`  主题　：${options.subject}`);
        console.log(`  内容　：${plain}\n`);
        return;
    }
    await getTransporter().sendMail({
        from: SMTP_FROM || SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
    })
}