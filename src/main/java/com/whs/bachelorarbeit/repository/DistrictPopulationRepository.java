package com.whs.bachelorarbeit.repository;

import com.whs.bachelorarbeit.entity.DistrictPopulation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface DistrictPopulationRepository extends JpaRepository<DistrictPopulation, Long> {

    @Query("select distinct d.stichtag from DistrictPopulation d order by d.stichtag desc")
    List<LocalDate> findAllStichtageDesc();

    List<DistrictPopulation> findByStichtag(LocalDate stichtag);

}
