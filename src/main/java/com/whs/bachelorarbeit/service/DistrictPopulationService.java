package com.whs.bachelorarbeit.service;


import com.whs.bachelorarbeit.dto.DistrictPopulationDTO;
import com.whs.bachelorarbeit.entity.DistrictPopulation;
import com.whs.bachelorarbeit.repository.DistrictPopulationRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

@Service
public class DistrictPopulationService {

    private final DistrictPopulationRepository repo;


    public DistrictPopulationService(DistrictPopulationRepository repo) {
        this.repo = repo;
    }


    public List<LocalDate> getLatestStichtage(int limit) {
        return repo.findAllStichtageDesc().stream().limit(limit).toList();
    }


    public List<DistrictPopulationDTO> getByStichtag(LocalDate stichtag) {
        return repo.findByStichtag(stichtag).stream()
                .sorted(Comparator.comparing(DistrictPopulation::getStadtteilName, String.CASE_INSENSITIVE_ORDER))
                .map(this::toDTO)
                .toList();
    }


    private DistrictPopulationDTO toDTO(DistrictPopulation d) {
        return new DistrictPopulationDTO(
                d.getStichtag(),
                d.getStadtteilId(),
                d.getStadtteilName(),
                d.getDeutsch(),
                d.getDeutschMit2Sta(),
                d.getNichtdeutsch(),
                d.getGesamt()
        );
    }
}
