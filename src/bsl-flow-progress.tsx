import type { BslFlow } from "./bsl-flow-model";
import { useI18n } from "./i18n-react";

export function BslFlowReviewStatus({ flow }: { flow: BslFlow }) {
  const { t } = useI18n();
  return (
    <span className="os-flow-chip" data-state={flow.review}>
      {t("flow.reviewSummary", { state: t(`flow.review.${flow.review}`) })}
    </span>
  );
}

export function BslFlowProgress({ flow }: { flow: BslFlow }) {
  const { t } = useI18n();
  const review = flow.review;
  return (
    <section className="os-flow" aria-label={t("flow.stages")}>
      <ol className="os-flow-stages">
        <li data-state={flow.spec ? "available" : "missing"}>
          <b>{t("flow.spec")}</b>
          <span>{t(flow.spec ? "flow.available" : "flow.missing")}</span>
        </li>
        <li data-state={review}>
          <b>{t("flow.review")}</b>
          <span>{t(`flow.review.${review}`)}</span>
        </li>
        <li>
          <b>{t("flow.implementation")}</b>
          <span>{t("flow.unconfirmed")}</span>
        </li>
        <li>
          <b>{t("flow.verification")}</b>
          <span>{t("flow.unconfirmed")}</span>
        </li>
      </ol>
      {review !== "passed" && review !== "optional" && (
        <p className="os-flow-note">{t(`flow.reason.${review}`)}</p>
      )}
    </section>
  );
}
