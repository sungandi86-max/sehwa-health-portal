import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { TrainingDetailView, TrainingListView } from "../../src/pages/TrainingCenterPage.jsx";
import { expectedTrainingDetail, expectedTrainingList } from "./trainingCenterFixture.js";
import "../../src/index.css";

const isDetail = new URLSearchParams(window.location.search).get("view") === "detail";

createRoot(document.getElementById("root")).render(
  <MemoryRouter>
    {isDetail
      ? <TrainingDetailView displayName="테스트 본인" state={{ status: "ready", item: expectedTrainingDetail }} />
      : <TrainingListView displayName="테스트 본인" state={{ status: "ready", items: expectedTrainingList }} />}
  </MemoryRouter>,
);
