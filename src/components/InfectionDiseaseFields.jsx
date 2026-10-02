import {
  INFECTION_DISEASE_OPTIONS,
  OTHER_DISEASE_NAME_MAX_LENGTH,
  OTHER_INFECTION_DISEASE,
} from "../lib/infectionDiseaseSelection.js";

const controlClassName =
  "!min-h-[44px] w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20";

function FieldLabel({ htmlFor, children }) {
  return <label htmlFor={htmlFor} className="text-sm font-semibold text-[#102047]">{children}</label>;
}

export default function InfectionDiseaseFields({ selectedDisease, otherDiseaseName, onDiseaseChange, onOtherDiseaseNameChange }) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel htmlFor="infection-disease">감염병명</FieldLabel>
        <select
          id="infection-disease"
          value={selectedDisease}
          onChange={(event) => onDiseaseChange(event.target.value)}
          className={`mt-2 cursor-pointer ${controlClassName}`}
        >
          <option value="">감염병을 선택해 주세요</option>
          {INFECTION_DISEASE_OPTIONS.map((disease) => (
            <option key={disease} value={disease}>{disease}</option>
          ))}
        </select>
      </div>

      {selectedDisease === OTHER_INFECTION_DISEASE && (
        <div>
          <FieldLabel htmlFor="infection-other-disease">기타 감염병명</FieldLabel>
          <input
            id="infection-other-disease"
            type="text"
            value={otherDiseaseName}
            onChange={(event) => onOtherDiseaseNameChange(event.target.value)}
            placeholder="감염병명을 입력해 주세요"
            maxLength={OTHER_DISEASE_NAME_MAX_LENGTH}
            className={`mt-2 ${controlClassName}`}
          />
        </div>
      )}
    </div>
  );
}
