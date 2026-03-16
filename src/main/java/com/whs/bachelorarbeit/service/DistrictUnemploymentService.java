package com.whs.bachelorarbeit.service;

import com.whs.bachelorarbeit.dto.DistrictUnemploymentDTO;
import com.whs.bachelorarbeit.entity.DistrictUnemployment;
import com.whs.bachelorarbeit.repository.DistrictUnemploymentRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Comparator;
import java.time.LocalDate;


@Service
public class DistrictUnemploymentService {

    private DistrictUnemploymentRepository repo;

    public DistrictUnemploymentService(DistrictUnemploymentRepository repo) {
        this.repo = repo;
    }

    public List<LocalDate> getLatestStichtage(int limit) {
        return repo.findAllStichtage().stream().limit(limit).toList();
    }

    public List<DistrictUnemploymentDTO> getByStichtag(LocalDate stichtag) {
        return repo.findByStichtag(stichtag).stream()
                .sorted(Comparator.comparing(DistrictUnemployment::getStadtteilName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toDTO)
                .toList();

    }

    public DistrictUnemploymentDTO toDTO(DistrictUnemployment d) {
        return new DistrictUnemploymentDTO(
                d.getStichtag(),
                d.getStadtteilId(),
                d.getStadtteilName(),
                d.getArbeitslosenanteil(),
                d.getArbeitslosenanteilMaennlich(),
                d.getArbeitslosenanteilWeiblich(),
                d.getArbeitslosenanteilDeutsch(),
                d.getArbeitslosenanteilNichtdeutsch(),
                d.getJugendarbeitslosigkeitU25()
        );
    }



}
